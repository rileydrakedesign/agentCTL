import { writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { stringify as yamlStringify } from "yaml";
import chalk from "chalk";
import type { Command } from "commander";
import type { ProjectConfig } from "../types.js";

const DEFAULT_CONFIG: ProjectConfig = {
  version: 1,
  project: { name: "" },
  runtime_targets: [{ model: "claude-sonnet-4-6", context_window: 200_000 }],
};

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("Initialize agentctl configuration")
    .option("-n, --name <name>", "Project name")
    .action(async (opts) => {
      const configPath = resolve("agentctl.yaml");

      if (existsSync(configPath)) {
        console.log(chalk.yellow("agentctl.yaml already exists. Skipping."));
        return;
      }

      const config = { ...DEFAULT_CONFIG };
      config.project.name = opts.name ?? inferProjectName();

      const yaml = yamlStringify(config);
      await writeFile(configPath, yaml);

      console.log("");
      console.log(`  ${chalk.bold("agentctl")} initialized`);
      console.log(`  Config written to ${chalk.cyan("agentctl.yaml")}`);
      console.log("");
      console.log(`  Next steps:`);
      console.log(`    ${chalk.dim("1.")} Edit agentctl.yaml to add runtime targets`);
      console.log(`    ${chalk.dim("2.")} Run ${chalk.cyan("agentctl scan")} to discover capabilities`);
      console.log(`    ${chalk.dim("3.")} Run ${chalk.cyan("agentctl plan")} for full analysis`);
      console.log("");
    });
}

function inferProjectName(): string {
  return process.cwd().split("/").pop() ?? "my-agent";
}
