import { Command } from "commander";
import { registerInitCommand } from "./init.js";
import { registerScanCommand } from "./scan.js";
import { registerPlanCommand } from "./plan.js";
import { registerDoctorCommand } from "./doctor.js";

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
  $ agentctl doctor`,
  );

registerInitCommand(program);
registerScanCommand(program);
registerPlanCommand(program);
registerDoctorCommand(program);

program.parse();
