/**
 * Mock MCP server for integration tests.
 *
 * Runs as a standalone process via stdio transport.
 * Configure via MOCK_SERVER_CONFIG env var (JSON string):
 *   { "tools": [...], "delay": 0 }
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

interface MockTool {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
}

interface MockConfig {
  tools: MockTool[];
  delay?: number;
}

const configStr = process.env.MOCK_SERVER_CONFIG ?? '{"tools":[]}';
const config: MockConfig = JSON.parse(configStr);

const server = new Server(
  { name: "mock-server", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  if (config.delay) {
    await new Promise((resolve) => setTimeout(resolve, config.delay));
  }

  return {
    tools: config.tools.map((t) => ({
      name: t.name,
      description: t.description ?? "",
      inputSchema: t.inputSchema ?? {
        type: "object" as const,
        properties: {},
      },
    })),
  };
});

const transport = new StdioServerTransport();
await server.connect(transport);
