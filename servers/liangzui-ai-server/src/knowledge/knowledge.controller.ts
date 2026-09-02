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

@Controller('knowledge')
export class KnowledgeController {
  constructor(@Inject(KnowledgeService) private readonly knowledge: KnowledgeService) {}

  @Post('datasets')
  createDataset(
    @Body(new ZodValidationPipe(CreateDatasetRequestSchema)) body: CreateDatasetRequest,
  ) {
    return this.knowledge.createDataset(body);
  }

  @Get('datasets')
  listDatasets() {
    return this.knowledge.listDatasets();
  }

  @Get('datasets/:datasetId')
  getDataset(@Param('datasetId', new ZodValidationPipe(UuidSchema)) datasetId: string) {
    return this.wrap(() => this.knowledge.getDataset(datasetId));
  }

  @Delete('datasets/:datasetId')
  deleteDataset(@Param('datasetId', new ZodValidationPipe(UuidSchema)) datasetId: string) {
    return this.wrap(() => this.knowledge.deleteDataset(datasetId));
  }

  @Get('datasets/:datasetId/documents')
  listDocuments(@Param('datasetId', new ZodValidationPipe(UuidSchema)) datasetId: string) {
    return this.knowledge.listDocuments(datasetId);
  }

  @Post('datasets/:datasetId/documents')
  createPasteDocument(
    @Param('datasetId', new ZodValidationPipe(UuidSchema)) datasetId: string,
    @Body(new ZodValidationPipe(CreatePasteDocumentRequestSchema))
    body: CreatePasteDocumentRequest,
  ) {
    return this.wrap(() => this.knowledge.createPasteDocument(datasetId, body));
  }

  @Post('datasets/:datasetId/documents/upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  uploadDocument(
    @Param('datasetId', new ZodValidationPipe(UuidSchema)) datasetId: string,
    @UploadedFile() file?: { originalname: string; buffer: Buffer },
  ) {
    if (!file) throw new BadRequestException('请选择要上传的文件');
    return this.wrap(() =>
      this.knowledge.createUploadDocument(
        datasetId,
        file.originalname,
        new Uint8Array(file.buffer),
      ),
    );
  }

  @Get('documents/:documentId')
  getDocument(@Param('documentId', new ZodValidationPipe(UuidSchema)) documentId: string) {
    return this.wrap(() => this.knowledge.getDocument(documentId));
  }

  @Delete('documents/:documentId')
  deleteDocument(@Param('documentId', new ZodValidationPipe(UuidSchema)) documentId: string) {
    return this.wrap(() => this.knowledge.deleteDocument(documentId));
  }

  @Post('documents/:documentId/reindex')
  reindex(@Param('documentId', new ZodValidationPipe(UuidSchema)) documentId: string) {
    return this.wrap(() => this.knowledge.reindex(documentId));
  }

  @Post('datasets/:datasetId/split-preview')
  splitPreview(
    @Param('datasetId', new ZodValidationPipe(UuidSchema)) datasetId: string,
    @Body(new ZodValidationPipe(SplitPreviewRequestSchema)) body: SplitPreviewRequest,
  ) {
    return this.wrap(async () => {
      await this.knowledge.getDataset(datasetId);
      return this.knowledge.previewSplit(body);
    });
  }

  @Post('datasets/:datasetId/retrieve')
  retrieve(
    @Param('datasetId', new ZodValidationPipe(UuidSchema)) datasetId: string,
    @Body(new ZodValidationPipe(RetrieveRequestSchema)) body: RetrieveRequest,
  ) {
    return this.wrap(() => this.knowledge.retrieve(datasetId, body));
  }

  @Post('datasets/:datasetId/answer')
  answer(
    @Param('datasetId', new ZodValidationPipe(UuidSchema)) datasetId: string,
    @Body(new ZodValidationPipe(KnowledgeAnswerRequestSchema)) body: KnowledgeAnswerRequest,
  ) {
    return this.wrap(() => this.knowledge.answer(datasetId, body));
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
