import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type {
  McpServerConfig,
  ServerScanResult,
  DiscoveredTool,
  Diagnostic,
  Transport,
} from "../types.js";
import { estimateToolTokens } from "../tokens/tokenizer.js";

const DEFAULT_TIMEOUT_MS = 30_000;

export async function scanServer(
  name: string,
  config: McpServerConfig,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<ServerScanResult> {
  const start = Date.now();
  const transport = resolveTransport(config);
  const diagnostics: Diagnostic[] = [];

  const client = new Client({ name: "agentctl", version: "0.1.0" });

  try {
    const clientTransport = createTransport(config, transport);

    await withTimeout(client.connect(clientTransport), timeoutMs);

    const response = await withTimeout(client.listTools(), timeoutMs);

    const tools: DiscoveredTool[] = (response.tools ?? []).map((tool) => {
      const estimate = estimateToolTokens(
        tool.description ?? "",
        tool.inputSchema as Record<string, unknown>,
      );
      return {
        name: tool.name,
        description: tool.description ?? "",
        input_schema: tool.inputSchema as Record<string, unknown>,
        token_estimate: estimate,
      };
    });

    return {
      server: name,
      status: "ok",
      transport,
      tools,
      latency_ms: Date.now() - start,
      diagnostics,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const type = classifyError(message);

    diagnostics.push({ server: name, type, message });

    return {
      server: name,
      status: "error",
      transport,
      tools: [],
      latency_ms: Date.now() - start,
      diagnostics,
    };
  } finally {
    try {
      await client.close();
    } catch {
      // Ignore close errors — server may already be gone
    }
  }
}

function resolveTransport(config: McpServerConfig): Transport {
  return config.url ? "sse" : "stdio";
}

function createTransport(
  config: McpServerConfig,
  transport: Transport,
): StdioClientTransport | SSEClientTransport {
  if (transport === "sse") {
    return new SSEClientTransport(new URL(config.url!));
  }

  if (!config.command) {
    throw new Error("stdio transport requires a command");
  }

  return new StdioClientTransport({
    command: config.command,
    args: config.args,
    env: config.env
      ? { ...process.env, ...config.env } as Record<string, string>
      : undefined,
  });
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timed out after ${ms}ms`)),
      ms,
    );
    promise
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

/** Classify an error message into a diagnostic type. */
export function classifyError(
  message: string,
): Diagnostic["type"] {
  const lower = message.toLowerCase();

  // Timeout
  if (lower.includes("timeout") || lower.includes("timed out")) return "timeout";

  // Auth — match HTTP status codes and auth-specific terms, avoid false-positive on "token" alone
  if (
    lower.includes("401") ||
    lower.includes("403") ||
    lower.includes("unauthorized") ||
    lower.includes("forbidden")
  ) {
    return "auth_failure";
  }

  // Parse errors
  if (
    lower.includes("unexpected token") ||
    lower.includes("json parse") ||
    lower.includes("syntaxerror")
  ) {
    return "parse_error";
  }

  // Everything else is connectivity
  return "connectivity_failure";
}
