import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export interface ToolHandler {
  (args: Record<string, unknown>): Promise<{
    content: Array<{ type: "text"; text: string }>;
  }>;
}

export interface ToolDefinition {
  tool: Tool;
  handler: ToolHandler;
}
