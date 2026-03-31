import ora from "ora";
import type { Command } from "commander";
import { discoverInputs, discoverInstructionFiles } from "../config/discover.js";
import { scanServer } from "../mcp/client.js";
import { parseSkillDirs } from "../skills/parse.js";
import { buildAgenticWorkspaceView } from "../workspace/agentic.js";
import { renderWorkspaceView } from "../output/workspace-terminal.js";
import type { ScanResult } from "../types.js";

export function registerWorkspaceCommand(program: Command): void {
  program
    .command("workspace")
    .description(
      "Map and analyze the agentic infrastructure: instructions, skills, MCP servers, and file tree",
    )
    .option("--config <path>", "Path to MCP config file")
    .option("--json", "Output JSON to stdout")
    .option("--no-scan", "Skip MCP server scanning (show structure only)")
    .action(async (opts) => {
      const spinner = ora("Discovering agentic infrastructure...").start();

      try {
        // Discover inputs (MCP config, prompts, skill dirs)
        spinner.text = "Discovering inputs...";
        const discovery = await discoverInputs(opts.config);

        // Discover instruction files recursively
        spinner.text = "Scanning for instruction files...";
        const instructionFiles = await discoverInstructionFiles();

        // Parse skills
        spinner.text = "Parsing skills...";
        const parsedSkills = await parseSkillDirs(discovery.skill_dirs);

        // Scan MCP servers (unless --no-scan)
        let scan: ScanResult;
        if (opts.scan === false) {
          scan = {
            version: 1,
            timestamp: new Date().toISOString(),
            servers: Object.keys(discovery.config.mcpServers).map((name) => ({
              server: name,
              status: "ok" as const,
              transport: "stdio" as const,
              tools: [],
              latency_ms: 0,
              diagnostics: [],
            })),
          };
        } else {
          const serverNames = Object.keys(discovery.config.mcpServers);
          spinner.text = `Scanning ${serverNames.length} MCP servers...`;

          const results = await Promise.allSettled(
            serverNames.map((name) =>
              scanServer(name, discovery.config.mcpServers[name]),
            ),
          );

          scan = {
            version: 1,
            timestamp: new Date().toISOString(),
            servers: results.map((r, i) => {
              if (r.status === "fulfilled") return r.value;
              return {
                server: serverNames[i],
                status: "error" as const,
                transport: "stdio" as const,
                tools: [],
                latency_ms: 0,
                diagnostics: [
                  {
                    server: serverNames[i],
                    type: "connectivity_failure" as const,
                    message: r.reason?.message ?? "Unknown error",
                  },
                ],
              };
            }),
          };
        }

        spinner.stop();

        // Build the workspace view
        const view = buildAgenticWorkspaceView(
          process.cwd(),
          instructionFiles,
          parsedSkills,
          scan,
          discovery,
        );

        // Output
        if (opts.json) {
          console.log(JSON.stringify(view, null, 2));
        } else {
          console.log(renderWorkspaceView(view));
        }
      } catch (err) {
        spinner.fail((err as Error).message);
        process.exit(1);
      }
    });
}
