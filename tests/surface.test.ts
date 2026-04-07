import { describe, it, expect } from "vitest";
import { getPlatformProfile, buildContextSurface } from "../src/analysis/surface.js";
import type {
  InstructionFile,
  ParsedSkill,
  ScanResult,
  RuntimeTarget,
} from "../src/types.js";
import type { DiscoveryResult } from "../src/config/discover.js";

function makeDiscovery(overrides?: Partial<DiscoveryResult>): DiscoveryResult {
  return {
    config: { mcpServers: {} },
    config_path: ".mcp.json",
    config_sources: [".mcp.json"],
    prompt_files: [],
    skill_dirs: [],
    ...overrides,
  };
}

function makeScan(
  servers: Array<{ name: string; tools: number; tokensPerTool?: number }>,
): ScanResult {
  return {
    version: 1,
    timestamp: new Date().toISOString(),
    servers: servers.map((s) => ({
      server: s.name,
      status: "ok" as const,
      transport: "stdio" as const,
      tools: Array.from({ length: s.tools }, (_, i) => ({
        name: `tool_${i}`,
        description: `Tool ${i} description`,
        input_schema: { type: "object" as const, properties: {} },
        token_estimate: {
          description_tokens: (s.tokensPerTool ?? 20) / 2,
          schema_tokens: (s.tokensPerTool ?? 20) / 2,
          total: s.tokensPerTool ?? 20,
        },
      })),
      latency_ms: 50,
      diagnostics: [],
    })),
  };
}

describe("getPlatformProfile", () => {
  it("returns claude-code profile", () => {
    const profile = getPlatformProfile("claude-code");
    expect(profile.name).toBe("claude-code");
    expect(profile.root_instruction_files).toContain("CLAUDE.md");
    expect(profile.root_instruction_files).toContain("AGENTS.md");
    expect(profile.supports_hooks).toBe(true);
    expect(profile.supports_mdc).toBe(false);
    expect(profile.supports_custom_instructions).toBe(true);
  });

  it("returns cursor profile with mdc support", () => {
    const profile = getPlatformProfile("cursor");
    expect(profile.name).toBe("cursor");
    expect(profile.root_instruction_files).toContain(".cursorrules");
    expect(profile.supports_mdc).toBe(true);
    expect(profile.supports_hooks).toBe(false);
  });

  it("returns windsurf profile", () => {
    const profile = getPlatformProfile("windsurf");
    expect(profile.name).toBe("windsurf");
    expect(profile.root_instruction_files).toContain(".windsurfrules");
    expect(profile.supports_mdc).toBe(false);
  });

  it("returns generic profile as union of all platforms", () => {
    const profile = getPlatformProfile("generic");
    expect(profile.name).toBe("generic");
    expect(profile.root_instruction_files).toContain("CLAUDE.md");
    expect(profile.root_instruction_files).toContain(".cursorrules");
    expect(profile.root_instruction_files).toContain(".windsurfrules");
    expect(profile.supports_mdc).toBe(true);
    expect(profile.supports_hooks).toBe(true);
  });
});

describe("buildContextSurface", () => {
  const root = process.cwd();
  const target: RuntimeTarget = { model: "claude-sonnet-4-6", context_window: 200_000 };

  it("creates layers from instruction files", () => {
    const instructions: InstructionFile[] = [
      { path: "CLAUDE.md", depth: 0, token_count: 500, scope: "root" },
      { path: "src/CLAUDE.md", depth: 1, token_count: 200, scope: "nested" },
    ];

    const surface = buildContextSurface(
      "claude-code",
      root,
      instructions,
      [],
      makeScan([]),
      makeDiscovery(),
      target,
    );

    expect(surface.platform).toBe("claude-code");
    const rootLayers = surface.layers.filter((l) => l.layer_type === "root_instruction");
    expect(rootLayers).toHaveLength(1);
    expect(rootLayers[0].source_path).toBe("CLAUDE.md");
    expect(rootLayers[0].always_present).toBe(true);
  });

  it("creates layers from MCP servers", () => {
    const surface = buildContextSurface(
      "claude-code",
      root,
      [],
      [],
      makeScan([
        { name: "github", tools: 5, tokensPerTool: 100 },
        { name: "filesystem", tools: 3, tokensPerTool: 50 },
      ]),
      makeDiscovery(),
      target,
    );

    const mcpLayers = surface.layers.filter((l) => l.layer_type === "mcp_tool_definitions");
    expect(mcpLayers).toHaveLength(2);
    expect(mcpLayers[0].source_path).toBe("mcp:github");
    expect(mcpLayers[0].token_count).toBe(500);
    expect(mcpLayers[1].source_path).toBe("mcp:filesystem");
    expect(mcpLayers[1].token_count).toBe(150);
    expect(mcpLayers[0].always_present).toBe(true);
  });

  it("creates layers from skills", () => {
    const skills: ParsedSkill[] = [
      { name: "deploy", path: "skills/deploy/SKILL.md", content: "Deploy instructions", token_count: 120 },
    ];

    const surface = buildContextSurface(
      "claude-code",
      root,
      [],
      skills,
      makeScan([]),
      makeDiscovery(),
      target,
    );

    const skillLayers = surface.layers.filter((l) => l.layer_type === "skill");
    expect(skillLayers).toHaveLength(1);
    expect(skillLayers[0].token_count).toBe(120);
    expect(skillLayers[0].always_present).toBe(false);
  });

  it("computes correct totals", () => {
    const instructions: InstructionFile[] = [
      { path: "CLAUDE.md", depth: 0, token_count: 1000, scope: "root" },
    ];

    const surface = buildContextSurface(
      "claude-code",
      root,
      instructions,
      [{ name: "deploy", path: "skills/deploy/SKILL.md", content: "x", token_count: 200 }],
      makeScan([{ name: "github", tools: 2, tokensPerTool: 100 }]),
      makeDiscovery(),
      target,
    );

    // Filter to just the layers we explicitly provided to validate logic
    const instructionTokens = surface.layers
      .filter((l) => l.layer_type === "root_instruction")
      .reduce((sum, l) => sum + l.token_count, 0);
    const mcpTokens = surface.layers
      .filter((l) => l.layer_type === "mcp_tool_definitions")
      .reduce((sum, l) => sum + l.token_count, 0);
    const skillTokens = surface.layers
      .filter((l) => l.layer_type === "skill")
      .reduce((sum, l) => sum + l.token_count, 0);

    expect(instructionTokens).toBe(1000);
    expect(mcpTokens).toBe(200);
    expect(skillTokens).toBe(200);
    expect(surface.total_tokens).toBeGreaterThanOrEqual(1400);
    expect(surface.conditional_tokens).toBe(skillTokens);
    expect(surface.core_tokens).toBe(surface.total_tokens - surface.conditional_tokens);
  });

  it("computes composition percentages", () => {
    const instructions: InstructionFile[] = [
      { path: "CLAUDE.md", depth: 0, token_count: 600, scope: "root" },
    ];

    const surface = buildContextSurface(
      "claude-code",
      root,
      instructions,
      [],
      makeScan([{ name: "github", tools: 2, tokensPerTool: 200 }]),
      makeDiscovery(),
      target,
    );

    // Verify composition entries exist with correct token counts
    expect(surface.composition["root_instruction"]).toBeDefined();
    expect(surface.composition["mcp_tool_definitions"]).toBeDefined();
    expect(surface.composition["root_instruction"]!.tokens).toBe(600);
    expect(surface.composition["mcp_tool_definitions"]!.tokens).toBe(400);

    const totalPct = Object.values(surface.composition).reduce(
      (sum, e) => sum + e.percentage,
      0,
    );
    expect(totalPct).toBeGreaterThanOrEqual(99);
    expect(totalPct).toBeLessThanOrEqual(101);
  });

  it("computes pressure against context window", () => {
    const instructions: InstructionFile[] = [
      { path: "CLAUDE.md", depth: 0, token_count: 50_000, scope: "root" },
    ];

    const surface = buildContextSurface(
      "claude-code",
      root,
      instructions,
      [],
      makeScan([]),
      makeDiscovery(),
      { model: "claude-sonnet-4-6", context_window: 200_000 },
    );

    expect(surface.pressure.model).toBe("claude-sonnet-4-6");
    expect(surface.pressure.context_window).toBe(200_000);
    // surface_pct should be at least 25% (50k/200k), possibly slightly more if agentctl.yaml exists
    expect(surface.pressure.surface_pct).toBeGreaterThanOrEqual(25);
    expect(surface.pressure.remaining_tokens).toBeLessThanOrEqual(150_000);
  });

  it("handles empty project gracefully", () => {
    const surface = buildContextSurface(
      "claude-code",
      root,
      [],
      [],
      makeScan([]),
      makeDiscovery(),
      target,
    );

    // May discover agentctl.yaml in the project root as project_config
    // But no instruction files, skills, or MCP servers should be present
    const instructionLayers = surface.layers.filter(
      (l) => l.layer_type === "root_instruction" || l.layer_type === "parent_instruction",
    );
    const mcpLayers = surface.layers.filter((l) => l.layer_type === "mcp_tool_definitions");
    const skillLayers = surface.layers.filter((l) => l.layer_type === "skill");

    expect(instructionLayers).toHaveLength(0);
    expect(mcpLayers).toHaveLength(0);
    expect(skillLayers).toHaveLength(0);
    expect(surface.conditional_tokens).toBe(0);
  });

  it("skips error servers in MCP layers", () => {
    const scan: ScanResult = {
      version: 1,
      timestamp: new Date().toISOString(),
      servers: [
        {
          server: "broken",
          status: "error",
          transport: "stdio",
          tools: [],
          latency_ms: 0,
          diagnostics: [{ server: "broken", type: "connectivity_failure", message: "failed" }],
        },
      ],
    };

    const surface = buildContextSurface(
      "claude-code",
      root,
      [],
      [],
      scan,
      makeDiscovery(),
      target,
    );

    const mcpLayers = surface.layers.filter((l) => l.layer_type === "mcp_tool_definitions");
    expect(mcpLayers).toHaveLength(0);
  });
});
