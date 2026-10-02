import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  CreateDatasetRequestSchema,
  CreatePasteDocumentRequestSchema,
  KnowledgeAnswerRequestSchema,
  RetrieveRequestSchema,
  SplitPreviewRequestSchema,
  UuidSchema,
  type CreateDatasetRequest,
  type CreatePasteDocumentRequest,
  type KnowledgeAnswerRequest,
  type RetrieveRequest,
  type SplitPreviewRequest,
} from '@ai-engine/contracts';
import { ZodValidationPipe } from '../http/zod-validation.pipe';
import { KnowledgeService } from './knowledge.service';
import { EmptyPdfTextError, UnsupportedDocumentTypeError } from './pipeline/extract';
import { RequirePermissions } from '../auth/access-policy';
import type { AuthPrincipal } from '../auth/auth.service';
import { CurrentPrincipal } from '../auth/current-principal';

@Controller('knowledge')
export class KnowledgeController {
  constructor(@Inject(KnowledgeService) private readonly knowledge: KnowledgeService) {}

  @RequirePermissions('knowledge:write')
  @Post('datasets')
  createDataset(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(CreateDatasetRequestSchema)) body: CreateDatasetRequest,
  ) {
    return this.knowledge.createDataset(principal.userId, body);
  }

  @RequirePermissions('knowledge:read')
  @Get('datasets')
  listDatasets(@CurrentPrincipal() principal: AuthPrincipal) {
    return this.knowledge.listDatasets(principal.userId);
  }

  @RequirePermissions('knowledge:read')
  @Get('datasets/:datasetId')
  getDataset(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('datasetId', new ZodValidationPipe(UuidSchema)) datasetId: string,
  ) {
    return this.wrap(() => this.knowledge.getDataset(principal.userId, datasetId));
  }

  @RequirePermissions('knowledge:write')
  @Delete('datasets/:datasetId')
  deleteDataset(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('datasetId', new ZodValidationPipe(UuidSchema)) datasetId: string,
  ) {
    return this.wrap(() => this.knowledge.deleteDataset(principal.userId, datasetId));
  }

  @RequirePermissions('knowledge:read')
  @Get('datasets/:datasetId/documents')
  listDocuments(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('datasetId', new ZodValidationPipe(UuidSchema)) datasetId: string,
  ) {
    return this.wrap(() => this.knowledge.listDocuments(principal.userId, datasetId));
  }

  @RequirePermissions('knowledge:write')
  @Post('datasets/:datasetId/documents')
  createPasteDocument(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('datasetId', new ZodValidationPipe(UuidSchema)) datasetId: string,
    @Body(new ZodValidationPipe(CreatePasteDocumentRequestSchema))
    body: CreatePasteDocumentRequest,
  ) {
    return this.wrap(() => this.knowledge.createPasteDocument(principal.userId, datasetId, body));
  }

  @RequirePermissions('knowledge:write')
  @Post('datasets/:datasetId/documents/upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  uploadDocument(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('datasetId', new ZodValidationPipe(UuidSchema)) datasetId: string,
    @UploadedFile() file?: { originalname: string; buffer: Buffer },
  ) {
    if (!file) throw new BadRequestException('请选择要上传的文件');
    return this.wrap(() =>
      this.knowledge.createUploadDocument(
        principal.userId,
        datasetId,
        file.originalname,
        new Uint8Array(file.buffer),
      ),
    );
  }

  @RequirePermissions('knowledge:read')
  @Get('documents/:documentId')
  getDocument(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('documentId', new ZodValidationPipe(UuidSchema)) documentId: string,
  ) {
    return this.wrap(() => this.knowledge.getDocument(principal.userId, documentId));
  }

  @RequirePermissions('knowledge:write')
  @Delete('documents/:documentId')
  deleteDocument(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('documentId', new ZodValidationPipe(UuidSchema)) documentId: string,
  ) {
    return this.wrap(() => this.knowledge.deleteDocument(principal.userId, documentId));
  }

  @RequirePermissions('knowledge:write')
  @Post('documents/:documentId/reindex')
  reindex(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('documentId', new ZodValidationPipe(UuidSchema)) documentId: string,
  ) {
    return this.wrap(() => this.knowledge.reindex(principal.userId, documentId));
  }

  @RequirePermissions('knowledge:read')
  @Post('datasets/:datasetId/split-preview')
  splitPreview(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('datasetId', new ZodValidationPipe(UuidSchema)) datasetId: string,
    @Body(new ZodValidationPipe(SplitPreviewRequestSchema)) body: SplitPreviewRequest,
  ) {
    return this.wrap(async () => {
      await this.knowledge.getDataset(principal.userId, datasetId);
      return this.knowledge.previewSplit(body);
    });
  }

  @RequirePermissions('knowledge:read')
  @Post('datasets/:datasetId/retrieve')
  retrieve(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('datasetId', new ZodValidationPipe(UuidSchema)) datasetId: string,
    @Body(new ZodValidationPipe(RetrieveRequestSchema)) body: RetrieveRequest,
  ) {
    return this.wrap(() => this.knowledge.retrieve(principal.userId, datasetId, body));
  }

  @RequirePermissions('knowledge:read')
  @Post('datasets/:datasetId/answer')
  answer(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('datasetId', new ZodValidationPipe(UuidSchema)) datasetId: string,
    @Body(new ZodValidationPipe(KnowledgeAnswerRequestSchema)) body: KnowledgeAnswerRequest,
  ) {
    return this.wrap(() => this.knowledge.answer(principal.userId, datasetId, body));
  }

  private async wrap<T>(run: () => Promise<T> | T): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if (error instanceof EmptyPdfTextError || error instanceof UnsupportedDocumentTypeError) {
        throw new BadRequestException(error.message);
      }
      const message = error instanceof Error ? error.message : '知识库操作失败';
      if (message.startsWith('NOT_FOUND:')) {
        throw new NotFoundException(message.slice('NOT_FOUND:'.length));
      }
      throw error;
    }
  }
}
