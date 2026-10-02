import { Module } from '@nestjs/common';
import { McpClientManager } from './mcp-client.manager';
import { MCP_CONNECTOR, SdkMcpConnector } from './mcp-connector';
import { MCP_TOOL_CATALOG } from './mcp-tool-catalog';
import { McpController } from './mcp.controller';

@Module({
  controllers: [McpController],
  providers: [
    { provide: MCP_CONNECTOR, useClass: SdkMcpConnector },
    McpClientManager,
    { provide: MCP_TOOL_CATALOG, useExisting: McpClientManager },
  ],
  exports: [McpClientManager, MCP_TOOL_CATALOG],
})
export class McpModule {}
