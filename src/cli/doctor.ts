import { existsSync } from "node:fs";
import { resolve } from "node:path";
import chalk from "chalk";
import ora from "ora";
import type { Command } from "commander";
import { discoverInputs, resolveHeaders } from "../config/discover.js";
import { loadProjectConfig } from "../config/parse.js";
import { scanServer } from "../mcp/client.js";
import { hasOAuthTokens } from "../mcp/oauth.js";

interface Check {
  name: string;
  status: "pass" | "fail" | "warn";
  message: string;
}

export function registerDoctorCommand(program: Command): void {
  program
    .command("doctor")
    .description("Validate configuration health and connectivity")
    .option("--config <path>", "Path to MCP config file")
    .action(async (opts) => {
      const checks: Check[] = [];

      // 1. agentctl.yaml
      try {
        const config = await loadProjectConfig();
        checks.push({
          name: "agentctl.yaml",
          status: "pass",
          message: `Valid (project: ${config.project.name})`,
        });
      } catch (err) {
        if (!existsSync(resolve("agentctl.yaml"))) {
          checks.push({
            name: "agentctl.yaml",
            status: "warn",
            message: "Not found — using defaults. Run `agentctl init`.",
          });
        } else {
          checks.push({
            name: "agentctl.yaml",
            status: "fail",
            message: (err as Error).message,
          });
        }
      }

      // 2. MCP config discovery
      let inputs;
      try {
        inputs = await discoverInputs(opts.config);
        checks.push({
          name: "MCP config",
          status: "pass",
          message: `Found at ${inputs.config_path}`,
        });
      } catch (err) {
        checks.push({
          name: "MCP config",
          status: "fail",
          message: (err as Error).message,
        });
        printChecks(checks);
        return;
      }

      // 3. Env var availability
      for (const [name, serverConfig] of Object.entries(inputs.config.mcpServers)) {
        if (serverConfig.env) {
          for (const key of Object.keys(serverConfig.env)) {
            const envVal: string = serverConfig.env[key];
            // Check if it references another env var
            if (envVal.startsWith("$") || envVal === "") {
              const envName = envVal.startsWith("$") ? envVal.slice(1) : key;
              if (!process.env[envName]) {
                checks.push({
                  name: `env: ${envName}`,
                  status: "warn",
                  message: `Referenced by ${name} but not set in environment`,
                });
              }
            }
          }
        }
      }

      // 4. OAuth token cache & header checks
      for (const [name, serverConfig] of Object.entries(inputs.config.mcpServers)) {
        if (serverConfig.oauth && serverConfig.url) {
          if (hasOAuthTokens(serverConfig.url)) {
            checks.push({
              name: `oauth: ${name}`,
              status: "pass",
              message: "Cached tokens found",
            });
          } else {
            checks.push({
              name: `oauth: ${name}`,
              status: "warn",
              message: "No cached tokens — run `agentctl scan` to authorize",
            });
          }
        }
        if (serverConfig.headers) {
          try {
            resolveHeaders(serverConfig.headers);
            checks.push({
              name: `headers: ${name}`,
              status: "pass",
              message: "All header env vars resolved",
            });
          } catch (err) {
            checks.push({
              name: `headers: ${name}`,
              status: "warn",
              message: (err as Error).message,
            });
          }
        }
      }

      // 5. MCP server connectivity (parallel)
      const serverNames = Object.keys(inputs.config.mcpServers);
      const spinner = ora(
        `Checking ${serverNames.length} MCP server${serverNames.length !== 1 ? "s" : ""}...`,
      ).start();

      const results = await Promise.allSettled(
        serverNames.map((name) =>
          scanServer(name, inputs.config.mcpServers[name]),
        ),
      );

      spinner.stop();

      for (let i = 0; i < results.length; i++) {
        const name = serverNames[i];
        const r = results[i];

        if (r.status === "fulfilled" && r.value.status === "ok") {
          checks.push({
            name: `mcp: ${name}`,
            status: "pass",
            message: `Connected — ${r.value.tools.length} tools (${r.value.latency_ms}ms)`,
          });
        } else {
          const errMsg =
            r.status === "rejected"
              ? (r.reason?.message ?? "Unknown error")
              : (r.value.diagnostics[0]?.message ?? "unknown");
          const errType =
            r.status === "fulfilled"
              ? (r.value.diagnostics[0]?.type ?? "error")
              : "connectivity_failure";
          checks.push({
            name: `mcp: ${name}`,
            status: "fail",
            message: `${errType}: ${errMsg}`,
          });
        }
      }

      // 6. Prompt files
      for (const file of inputs.prompt_files) {
        checks.push({
          name: `prompt: ${file}`,
          status: "pass",
          message: "Found",
        });
      }

      // 7. Skill directories
      for (const dir of inputs.skill_dirs) {
        checks.push({
          name: `skills: ${dir}`,
          status: "pass",
          message: "Found",
        });
      }

      printChecks(checks);
    });
}

function printChecks(checks: Check[]): void {
  console.log("");
  console.log(`  ${chalk.bold("agentctl doctor")}`);
  console.log("");

  for (const check of checks) {
    const icon =
      check.status === "pass"
        ? chalk.green("v")
        : check.status === "warn"
          ? chalk.yellow("!")
          : chalk.red("x");
    console.log(`  ${icon} ${chalk.bold(check.name)}: ${check.message}`);
  }

  const failed = checks.filter((c) => c.status === "fail").length;
  const warned = checks.filter((c) => c.status === "warn").length;
  const passed = checks.filter((c) => c.status === "pass").length;

  console.log("");
  console.log(
    `  ${passed} passed, ${warned} warnings, ${failed} failed`,
  );
  console.log("");

  if (failed > 0) process.exit(1);
}
