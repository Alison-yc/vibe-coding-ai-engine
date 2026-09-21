import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import {
  CreateWorkflowRequestSchema,
  RunNodeRequestSchema,
  RunWorkflowRequestSchema,
  StopWorkflowResponseSchema,
  UpdateWorkflowRequestSchema,
  UuidSchema,
  ValidateWorkflowRequestSchema,
  type CreateWorkflowRequest,
  type RunNodeRequest,
  type RunWorkflowRequest,
  type UpdateWorkflowRequest,
  type ValidateWorkflowRequest,
} from '@ai-engine/contracts';
import type { Request, Response } from 'express';
import { abortOnClientClose } from '../http/abort-on-client-close';
import { ZodValidationPipe } from '../http/zod-validation.pipe';
import { WorkflowGraphValidationError } from './engine/workflow-engine';
import { WorkflowService } from './workflow.service';

@Controller('workflows')
export class WorkflowController {
  constructor(private readonly workflows: WorkflowService) {}

  @Post()
  create(@Body(new ZodValidationPipe(CreateWorkflowRequestSchema)) body: CreateWorkflowRequest) {
    return this.workflows.createWorkflow(body);
  }

  @Get()
  list() {
    return this.workflows.listWorkflows();
  }

  @Get('runs/:runId')
  getRun(@Param('runId', new ZodValidationPipe(UuidSchema)) runId: string) {
    return this.wrap(() => this.workflows.getRun(runId));
  }

  @Get(':workflowId/runs')
  listRuns(@Param('workflowId', new ZodValidationPipe(UuidSchema)) workflowId: string) {
    return this.wrap(() => this.workflows.listRuns(workflowId));
  }

  @Get(':workflowId')
  get(@Param('workflowId', new ZodValidationPipe(UuidSchema)) workflowId: string) {
    return this.wrap(() => this.workflows.getWorkflow(workflowId));
  }

  @Patch(':workflowId')
  update(
    @Param('workflowId', new ZodValidationPipe(UuidSchema)) workflowId: string,
    @Body(new ZodValidationPipe(UpdateWorkflowRequestSchema)) body: UpdateWorkflowRequest,
  ) {
    return this.wrap(() => this.workflows.updateWorkflow(workflowId, body));
  }

  @Delete(':workflowId')
  delete(@Param('workflowId', new ZodValidationPipe(UuidSchema)) workflowId: string) {
    return this.wrap(() => this.workflows.deleteWorkflow(workflowId));
  }

  @Post(':workflowId/validate')
  validate(
    @Param('workflowId', new ZodValidationPipe(UuidSchema)) workflowId: string,
    @Body(new ZodValidationPipe(ValidateWorkflowRequestSchema)) body: ValidateWorkflowRequest,
  ) {
    return this.wrap(() => this.workflows.validate(workflowId, body));
  }

  @Post(':workflowId/run')
  async run(
    @Param('workflowId', new ZodValidationPipe(UuidSchema)) workflowId: string,
    @Body(new ZodValidationPipe(RunWorkflowRequestSchema)) body: RunWorkflowRequest,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    try {
      await this.workflows.assertRunnable(workflowId);
    } catch (error) {
      this.throwHttpError(error);
    }
    response.status(200);
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders();
    try {
      await this.workflows.stream(workflowId, body, abortOnClientClose(request), (event) => {
        response.write(`event: ${event.event}\n`);
        response.write(`data: ${JSON.stringify(event.data)}\n\n`);
      });
    } finally {
      response.end();
    }
  }

  @Post('runs/:runId/stop')
  stop(@Param('runId', new ZodValidationPipe(UuidSchema)) runId: string) {
    return StopWorkflowResponseSchema.parse(this.workflows.stop(runId));
  }

  @Post(':workflowId/nodes/:nodeId/run')
  runNode(
    @Param('workflowId', new ZodValidationPipe(UuidSchema)) workflowId: string,
    @Param('nodeId') nodeId: string,
    @Body(new ZodValidationPipe(RunNodeRequestSchema)) body: RunNodeRequest,
  ) {
    return this.wrap(() => this.workflows.runNode(workflowId, nodeId, body));
  }

  private async wrap<T>(run: () => Promise<T> | T): Promise<T> {
    try {
      return await run();
    } catch (error) {
      this.throwHttpError(error);
    }
  }

  private throwHttpError(error: unknown): never {
    const message = error instanceof Error ? error.message : '工作流操作失败';
    if (message.startsWith('NOT_FOUND:')) {
      throw new NotFoundException(message.slice('NOT_FOUND:'.length));
    }
    if (error instanceof WorkflowGraphValidationError) {
      throw new BadRequestException({ message: error.message, errors: error.errors });
    }
    throw error;
  }
}
