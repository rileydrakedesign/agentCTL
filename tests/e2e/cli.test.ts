import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { existsSync } from "node:fs";
import { runCli } from "./helpers.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "agentctl-test-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("CLI e2e", () => {
  it("--help exits 0 and shows all commands", async () => {
    const result = await runCli(["--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("init");
    expect(result.stdout).toContain("scan");
    expect(result.stdout).toContain("plan");
    expect(result.stdout).toContain("doctor");
  });

  it("--version outputs version number", async () => {
    const result = await runCli(["--version"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("0.1.0");
  });

  it("init creates agentctl.yaml", async () => {
    const result = await runCli(["init", "--name", "test-project"], {
      cwd: tempDir,
    });
    expect(result.exitCode).toBe(0);
    expect(existsSync(join(tempDir, "agentctl.yaml"))).toBe(true);

    const content = await readFile(join(tempDir, "agentctl.yaml"), "utf-8");
    expect(content).toContain("test-project");
  });

  it("init --name sets project name", async () => {
    await runCli(["init", "--name", "my-custom-name"], { cwd: tempDir });
    const content = await readFile(join(tempDir, "agentctl.yaml"), "utf-8");
    expect(content).toContain("my-custom-name");
  });

  it("init twice shows already exists", async () => {
    await runCli(["init"], { cwd: tempDir });
    const result = await runCli(["init"], { cwd: tempDir });
    expect(result.stdout).toContain("already exists");
  });

  it("scan --config with nonexistent file exits 1", async () => {
    const result = await runCli(["scan", "--config", "/nonexistent/path.json"], {
      cwd: tempDir,
    });
    expect(result.exitCode).toBe(1);
  });

  it("plan --json --cached with fixture scan.json outputs valid JSON", async () => {
    const outDir = join(tempDir, ".agentctl", "latest");
    await mkdir(outDir, { recursive: true });

    // Write fixture scan.json
    const scan = {
      version: 1,
      timestamp: new Date().toISOString(),
      servers: [
        {
          server: "test",
          status: "ok",
          transport: "stdio",
          tools: [
            {
              name: "test_tool",
              description: "A test tool",
              input_schema: { type: "object", properties: {} },
              token_estimate: { description_tokens: 5, schema_tokens: 10, total: 15 },
            },
          ],
          latency_ms: 100,
          diagnostics: [],
        },
      ],
    };
    await writeFile(join(outDir, "scan.json"), JSON.stringify(scan));

    // Write minimal MCP config for discoverInputs
    await writeFile(
      join(tempDir, ".mcp.json"),
      JSON.stringify({ mcpServers: {} }),
    );

    const result = await runCli(
      ["plan", "--json", "--cached", "--out", outDir],
      { cwd: tempDir },
    );

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.version).toBe(1);
    expect(parsed.capabilities.mcp_tools).toBe(1);
    expect(parsed.budgets.discovery_tokens).toBe(15);
  });

  it("plan --fail-on error with no config exits 1", async () => {
    const result = await runCli(
      ["plan", "--fail-on", "error"],
      { cwd: tempDir },
    );
    // Should fail because no MCP config exists
    expect(result.exitCode).toBe(1);
  });
});
