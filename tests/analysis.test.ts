import { describe, it, expect } from "vitest";
import { detectRedundancy } from "../src/analysis/redundancy.js";
import { detectDeadCapabilities } from "../src/analysis/dead-caps.js";
import type { ServerScanResult } from "../src/types.js";

function makeServer(
  name: string,
  tools: { name: string; description: string }[],
): ServerScanResult {
  return {
    server: name,
    status: "ok",
    transport: "stdio",
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: { type: "object", properties: {} },
      token_estimate: { description_tokens: 10, schema_tokens: 10, total: 20 },
    })),
    latency_ms: 100,
    diagnostics: [],
  };
}

describe("detectRedundancy", () => {
  it("returns empty for no servers", () => {
    expect(detectRedundancy([])).toEqual([]);
  });

  it("detects similar tools across servers", () => {
    const servers = [
      makeServer("github", [
        {
          name: "search_code",
          description:
            "Search for source code files in the repository using a text query string to find matching content and return results with line numbers",
        },
      ]),
      makeServer("filesystem", [
        {
          name: "grep_search",
          description:
            "Search for source code files in the repository using a text query string to find matching content and return results with line numbers",
        },
      ]),
    ];
    const clusters = detectRedundancy(servers);
    expect(clusters.length).toBeGreaterThanOrEqual(1);
    expect(clusters[0].similarity).toBeGreaterThanOrEqual(0.8);
  });

  it("does not flag tools within the same server", () => {
    const servers = [
      makeServer("github", [
        { name: "search_code", description: "Search for code in repositories" },
        { name: "search_repos", description: "Search for code in repositories" },
      ]),
    ];
    const clusters = detectRedundancy(servers);
    expect(clusters).toEqual([]);
  });
});

describe("detectDeadCapabilities", () => {
  it("flags tools with empty descriptions", () => {
    const servers = [
      makeServer("test", [
        { name: "good_tool", description: "This tool does something useful" },
        { name: "bad_tool", description: "" },
      ]),
    ];
    const dead = detectDeadCapabilities(servers);
    expect(dead).toHaveLength(1);
    expect(dead[0].tool).toBe("bad_tool");
  });

  it("flags servers with 0 tools", () => {
    const servers = [makeServer("empty", [])];
    const dead = detectDeadCapabilities(servers);
    expect(dead).toHaveLength(1);
    expect(dead[0].tool).toBe("*");
  });
});
