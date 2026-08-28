import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import {
  ChatMessageListResponseSchema,
  ChatSessionListResponseSchema,
  ChatStreamRequestSchema,
  CreateChatSessionRequestSchema,
  UpdateChatSessionRequestSchema,
  UuidSchema,
  type ChatStreamRequest,
  type CreateChatSessionRequest,
  type UpdateChatSessionRequest,
} from '@ai-engine/contracts';
import type { Request, Response } from 'express';
import { abortOnClientClose } from '../http/abort-on-client-close';
import { ZodValidationPipe } from '../http/zod-validation.pipe';
import { ChatService } from './chat.service';

const flushResponse = (response: Response): void => {
  (response as Response & { flush?: () => void }).flush?.();
};

@Controller('chat')
export class ChatController {
  constructor(@Inject(ChatService) private readonly chat: ChatService) {}

  @Post('sessions')
  createSession(
    @Body(new ZodValidationPipe(CreateChatSessionRequestSchema)) body: CreateChatSessionRequest,
  ) {
    return this.chat.createSession(body);
  }

  @Get('sessions')
  async listSessions() {
    return ChatSessionListResponseSchema.parse({ sessions: await this.chat.listSessions() });
  }

  @Get('sessions/:sessionId')
  getSession(@Param('sessionId', new ZodValidationPipe(UuidSchema)) sessionId: string) {
    return this.wrap(() => this.chat.getSession(sessionId));
  }

  @Patch('sessions/:sessionId')
  updateSession(
    @Param('sessionId', new ZodValidationPipe(UuidSchema)) sessionId: string,
    @Body(new ZodValidationPipe(UpdateChatSessionRequestSchema)) body: UpdateChatSessionRequest,
  ) {
    return this.wrap(() => this.chat.updateSession(sessionId, body));
  }

  @Delete('sessions/:sessionId')
  deleteSession(@Param('sessionId', new ZodValidationPipe(UuidSchema)) sessionId: string) {
    return this.wrap(() => this.chat.deleteSession(sessionId));
  }

  @Get('sessions/:sessionId/messages')
  async listMessages(@Param('sessionId', new ZodValidationPipe(UuidSchema)) sessionId: string) {
    return this.wrap(async () =>
      ChatMessageListResponseSchema.parse({
        messages: await this.chat.listMessages(sessionId),
      }),
    );
  }

  @Post('sessions/:sessionId/stream')
  async stream(
    @Param('sessionId', new ZodValidationPipe(UuidSchema)) sessionId: string,
    @Body(new ZodValidationPipe(ChatStreamRequestSchema)) body: ChatStreamRequest,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    response.status(200);
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders();
    try {
      await this.chat.stream(sessionId, body, abortOnClientClose(request), (event) => {
        response.write(`event: ${event.event}\n`);
        response.write(`data: ${JSON.stringify(event.data)}\n\n`);
        flushResponse(response);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '生成失败';
      if (message.startsWith('NOT_FOUND:')) {
        response.write(`event: error\ndata: ${JSON.stringify({ message: message.slice(10) })}\n\n`);
      } else {
        response.write(`event: error\ndata: ${JSON.stringify({ message })}\n\n`);
      }
      flushResponse(response);
    } finally {
      response.end();
    }
  }

  private async wrap<T>(run: () => Promise<T> | T): Promise<T> {
    try {
      return await run();
    } catch (error) {
      const message = error instanceof Error ? error.message : '会话操作失败';
      if (message.startsWith('NOT_FOUND:')) {
        throw new NotFoundException(message.slice('NOT_FOUND:'.length));
      }
      throw error;
    }
  }
}
