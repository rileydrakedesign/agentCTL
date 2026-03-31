import { Command } from "commander";
import { registerInitCommand } from "./init.js";
import { registerScanCommand } from "./scan.js";
import { registerPlanCommand } from "./plan.js";
import { registerDoctorCommand } from "./doctor.js";
import { registerDiffCommand } from "./diff.js";
import { registerOptimizeCommand } from "./optimize.js";
import { registerWorkspaceCommand } from "./workspace.js";

const program = new Command();

program
  .name("agentctl")
  .description("Configuration intelligence for AI agent toolchains")
  .version("0.1.0")
  .addHelpText(
    "after",
    `
Examples:
  $ agentctl init
  $ agentctl scan
  $ agentctl plan --models claude-sonnet-4-6,gpt-4o
  $ agentctl plan --fail-on warning --max-discovery-tokens 50000
  $ agentctl doctor
  $ agentctl diff --base main
  $ agentctl diff --base main --fail-on-increase 10
  $ agentctl optimize
  $ agentctl optimize --apply --backup
  $ agentctl workspace
  $ agentctl workspace --no-scan --json`,
  );

registerInitCommand(program);
registerScanCommand(program);
registerPlanCommand(program);
registerDoctorCommand(program);
registerDiffCommand(program);
registerOptimizeCommand(program);
registerWorkspaceCommand(program);

program.parse();
