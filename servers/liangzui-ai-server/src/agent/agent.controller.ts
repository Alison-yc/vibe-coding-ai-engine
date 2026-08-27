import {
  AgentStreamRequestSchema,
  PermissionResponseRequestSchema,
  UuidSchema,
  type AgentStreamRequest,
  type PermissionResponseRequest,
} from '@ai-engine/contracts';
import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { abortOnClientClose } from '../http/abort-on-client-close';
import { ZodValidationPipe } from '../http/zod-validation.pipe';
import { AgentService } from './agent.service';

@Controller('agent')
export class AgentController {
  constructor(@Inject(AgentService) private readonly agent: AgentService) {}

  @Get('tools')
  listTools(@Query('sessionId') sessionId?: string) {
    const parsed = sessionId ? UuidSchema.safeParse(sessionId) : undefined;
    if (parsed && !parsed.success) throw new NotFoundException('会话不存在');
    return this.agent.listExposedTools(parsed?.data);
  }

  @Post(':sessionId/stream')
  async stream(
    @Param('sessionId', new ZodValidationPipe(UuidSchema)) sessionId: string,
    @Body(new ZodValidationPipe(AgentStreamRequestSchema)) body: AgentStreamRequest,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    response.status(200);
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders();
    const writeEvent = (event: string, data: unknown): void => {
      if (response.destroyed || response.writableEnded) return;
      response.write(`event: ${event}\n`);
      response.write(`data: ${JSON.stringify(data)}\n\n`);
    };
    try {
      await this.agent.stream(sessionId, body, abortOnClientClose(request), (event) => {
        writeEvent(event.event, event.data);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Agent 执行失败';
      writeEvent('error', { message });
    } finally {
      if (!response.destroyed && !response.writableEnded) response.end();
    }
  }

  @Post(':sessionId/permissions/:approvalId')
  respondPermission(
    @Param('sessionId', new ZodValidationPipe(UuidSchema)) sessionId: string,
    @Param('approvalId', new ZodValidationPipe(UuidSchema)) approvalId: string,
    @Body(new ZodValidationPipe(PermissionResponseRequestSchema))
    body: PermissionResponseRequest,
  ) {
    if (!this.agent.respondPermission(sessionId, approvalId, body.decision)) {
      throw new NotFoundException('审批不存在、已过期或不属于当前会话');
    }
    return { accepted: true };
  }
}
