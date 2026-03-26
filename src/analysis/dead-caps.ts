import type { ServerScanResult, DeadCapability } from "../types.js";

/** Detect tools with empty descriptions, broken schemas, or empty servers. */
export function detectDeadCapabilities(
  servers: ServerScanResult[],
): DeadCapability[] {
  const dead: DeadCapability[] = [];

  for (const server of servers) {
    if (server.status !== "ok") continue;

    if (server.tools.length === 0) {
      dead.push({
        server: server.server,
        tool: "*",
        reason: "Server returned 0 tools",
      });
      continue;
    }

    for (const tool of server.tools) {
      if (!tool.description || tool.description.trim().length < 5) {
        dead.push({
          server: server.server,
          tool: tool.name,
          reason: "Empty or near-empty description",
        });
      }

      if (hasUndefinedRefs(tool.input_schema)) {
        dead.push({
          server: server.server,
          tool: tool.name,
          reason: "Schema references undefined types",
        });
      }
    }
  }

  return dead;
}

function hasUndefinedRefs(schema: Record<string, unknown>): boolean {
  const str = JSON.stringify(schema);
  // Check for $ref pointing to non-existent definitions
  if (str.includes('"$ref"')) {
    const refs = str.match(/"\$ref"\s*:\s*"([^"]+)"/g) ?? [];
    for (const ref of refs) {
      const path = ref.match(/"([^"]+)"$/)?.[1];
      if (path && !str.includes(`"${path.split("/").pop()}"`)) {
        return true;
      }
    }
  }
  return false;
}
