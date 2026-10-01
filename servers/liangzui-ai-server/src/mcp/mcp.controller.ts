import {
  McpServerNameSchema,
  McpServerPatchRequestSchema,
  type McpServerPatchRequest,
} from '@ai-engine/contracts';
import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Body,
} from '@nestjs/common';
import { ZodValidationPipe } from '../http/zod-validation.pipe';
import { McpClientManager } from './mcp-client.manager';
import { RequirePermissions } from '../auth/access-policy';

const asHttp = async <T>(task: () => Promise<T> | T): Promise<T> => {
  try {
    return await task();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'MCP 操作失败';
    if (message.includes('不存在')) throw new NotFoundException(message);
    throw error;
  }
};

@Controller('mcp')
export class McpController {
  constructor(@Inject(McpClientManager) private readonly mcp: McpClientManager) {}

  @RequirePermissions('mcp:read')
  @Get('servers')
  listServers() {
    return { servers: this.mcp.listServers() };
  }

  @RequirePermissions('mcp:read')
  @Get('servers/:name/tools')
  async listTools(@Param('name', new ZodValidationPipe(McpServerNameSchema)) name: string) {
    return asHttp(() => ({ tools: this.mcp.listServerTools(name) }));
  }

  @RequirePermissions('mcp:manage')
  @Post('servers/:name/reconnect')
  reconnect(@Param('name', new ZodValidationPipe(McpServerNameSchema)) name: string) {
    return asHttp(() => this.mcp.reconnect(name));
  }

  @RequirePermissions('mcp:manage')
  @Patch('servers/:name')
  patch(
    @Param('name', new ZodValidationPipe(McpServerNameSchema)) name: string,
    @Body(new ZodValidationPipe(McpServerPatchRequestSchema)) body: McpServerPatchRequest,
  ) {
    return asHttp(() => this.mcp.patch(name, body));
  }
}
