import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFile, readFile, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  readRawConfig,
  filterActionsForFile,
  applyOptimizations,
} from "../../src/optimize/apply.js";
import type { OptimizeAction } from "../../src/types.js";

let testDir: string;

beforeEach(async () => {
  testDir = join(tmpdir(), `agentctl-optimize-test-${Date.now()}`);
  await mkdir(testDir, { recursive: true });
});

afterEach(async () => {
  if (existsSync(testDir)) {
    await rm(testDir, { recursive: true });
  }
});

describe("readRawConfig", () => {
  it("parses JSON and preserves extra keys", async () => {
    const configPath = join(testDir, ".mcp.json");
    await writeFile(
      configPath,
      JSON.stringify({
        mcpServers: { github: { command: "npx" } },
        customKey: "preserved",
      }),
    );
    const raw = await readRawConfig(configPath);
    expect(raw.mcpServers).toBeDefined();
    expect(raw.customKey).toBe("preserved");
  });
});

describe("filterActionsForFile", () => {
  it("keeps actions for servers in the file", () => {
    const raw = { mcpServers: { github: {}, filesystem: {} } };
    const actions: OptimizeAction[] = [
      {
        type: "remove_dead_server",
        server: "github",
        rationale: "Dead",
        token_savings: 0,
      },
    ];
    const { applicable, extraFindings } = filterActionsForFile(raw, actions);
    expect(applicable).toHaveLength(1);
    expect(extraFindings).toHaveLength(0);
  });

  it("downgrades actions for servers not in file to ManualFindings", () => {
    const raw = { mcpServers: { github: {} } };
    const actions: OptimizeAction[] = [
      {
        type: "remove_dead_server",
        server: "from-other-source",
        rationale: "Dead",
        token_savings: 0,
      },
    ];
    const { applicable, extraFindings } = filterActionsForFile(raw, actions);
    expect(applicable).toHaveLength(0);
    expect(extraFindings).toHaveLength(1);
    expect(extraFindings[0].server).toBe("from-other-source");
  });
});

describe("applyOptimizations", () => {
  it("removes specified servers and writes config", async () => {
    const configPath = join(testDir, ".mcp.json");
    const original = {
      mcpServers: {
        github: { command: "npx", args: ["github-server"] },
        dead: { command: "npx", args: ["dead-server"] },
        filesystem: { command: "npx", args: ["fs-server"] },
      },
    };
    await writeFile(configPath, JSON.stringify(original));

    const raw = await readRawConfig(configPath);
    const actions: OptimizeAction[] = [
      {
        type: "remove_dead_server",
        server: "dead",
        rationale: "Server returned 0 tools",
        token_savings: 0,
      },
    ];

    await applyOptimizations(raw, actions, {
      configPath,
      backup: false,
    });

    const result = JSON.parse(await readFile(configPath, "utf-8"));
    expect(Object.keys(result.mcpServers)).toEqual(["github", "filesystem"]);
    expect(result.mcpServers.dead).toBeUndefined();
  });

  it("creates backup when requested", async () => {
    const configPath = join(testDir, ".mcp.json");
    const original = {
      mcpServers: {
        github: { command: "npx" },
        dead: { command: "npx" },
      },
    };
    await writeFile(configPath, JSON.stringify(original));

    const raw = await readRawConfig(configPath);
    const actions: OptimizeAction[] = [
      {
        type: "remove_dead_server",
        server: "dead",
        rationale: "Dead",
        token_savings: 0,
      },
    ];

    const result = await applyOptimizations(raw, actions, {
      configPath,
      backup: true,
    });

    expect(result.backupPath).toBe(`${configPath}.backup`);
    expect(existsSync(result.backupPath!)).toBe(true);

    // Backup should contain original content
    const backupContent = JSON.parse(
      await readFile(result.backupPath!, "utf-8"),
    );
    expect(Object.keys(backupContent.mcpServers)).toEqual(["github", "dead"]);
  });

  it("preserves extra JSON keys", async () => {
    const configPath = join(testDir, ".mcp.json");
    const original = {
      mcpServers: { keep: { command: "npx" }, remove: { command: "npx" } },
      someOtherKey: { nested: true },
    };
    await writeFile(configPath, JSON.stringify(original));

    const raw = await readRawConfig(configPath);
    await applyOptimizations(
      raw,
      [
        {
          type: "remove_dead_server",
          server: "remove",
          rationale: "Dead",
          token_savings: 0,
        },
      ],
      { configPath, backup: false },
    );

    const result = JSON.parse(await readFile(configPath, "utf-8"));
    expect(result.someOtherKey).toEqual({ nested: true });
  });

  it("refuses to remove all servers", async () => {
    const configPath = join(testDir, ".mcp.json");
    await writeFile(
      configPath,
      JSON.stringify({ mcpServers: { only: { command: "npx" } } }),
    );

    const raw = await readRawConfig(configPath);
    await expect(
      applyOptimizations(
        raw,
        [
          {
            type: "remove_dead_server",
            server: "only",
            rationale: "Dead",
            token_savings: 0,
          },
        ],
        { configPath, backup: false },
      ),
    ).rejects.toThrow("Refusing to remove all servers");
  });
});
