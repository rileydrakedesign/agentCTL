import chalk from "chalk";
import ora from "ora";
import type { Command } from "commander";
import { discoverInputs } from "../config/discover.js";
import { scanServer } from "../mcp/client.js";
import { writeScanArtifact } from "../output/artifacts.js";
import { formatScanJson } from "../output/json.js";
import type { ScanResult } from "../types.js";

export function registerScanCommand(program: Command): void {
  program
    .command("scan")
    .description("Discover capabilities from configured MCP servers")
    .option("--config <path>", "Path to MCP config file")
    .option("--json", "Output JSON to stdout")
    .option("--out <dir>", "Custom output directory")
    .action(async (opts) => {
      const spinner = ora("Discovering MCP config...").start();

      let inputs;
      try {
        inputs = await discoverInputs(opts.config);
      } catch (err) {
        spinner.fail((err as Error).message);
        process.exit(1);
      }

      const serverNames = Object.keys(inputs.config.mcpServers);
      if (serverNames.length === 0) {
        spinner.warn("No MCP servers configured. Add servers to your MCP config.");
        return;
      }
      spinner.text = `Scanning ${serverNames.length} MCP server${serverNames.length !== 1 ? "s" : ""}...`;

      const results = await Promise.allSettled(
        serverNames.map((name) =>
          scanServer(name, inputs.config.mcpServers[name]),
        ),
      );

      const scan: ScanResult = {
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

      spinner.stop();

      if (opts.json) {
        console.log(formatScanJson(scan));
        return;
      }

      // Write artifacts
      const dir = await writeScanArtifact(scan, opts.out);

      // Print summary
      const ok = scan.servers.filter((s) => s.status === "ok");
      const failed = scan.servers.filter((s) => s.status === "error");
      const totalTools = ok.reduce((sum, s) => sum + s.tools.length, 0);

      console.log("");
      console.log(`  ${chalk.bold("Scan complete")}`);
      console.log(
        `  Servers: ${ok.length} ok${failed.length > 0 ? `, ${chalk.yellow(`${failed.length} failed`)}` : ""}`,
      );
      console.log(`  Tools:   ${totalTools}`);

      for (const server of ok) {
        console.log(
          `    ${chalk.green("+")} ${server.server}: ${server.tools.length} tools (${server.latency_ms}ms)`,
        );
      }
      for (const server of failed) {
        console.log(
          `    ${chalk.red("x")} ${server.server}: ${server.diagnostics[0]?.message ?? "failed"}`,
        );
      }

      console.log("");
      console.log(`  Artifacts: ${chalk.dim(dir)}`);
      console.log("");
    });
}
