import chalk from "chalk";
import ora from "ora";
import type { Command } from "commander";
import { runPlanPipeline } from "./plan.js";
import { computeOptimizeActions } from "../optimize/actions.js";
import {
  readRawConfig,
  filterActionsForFile,
  applyOptimizations,
} from "../optimize/apply.js";
import { renderOptimizeResult } from "../output/optimize-terminal.js";
import { writeOptimizeArtifact } from "../output/artifacts.js";
import type { OptimizeResult, PlanReport, ScanResult } from "../types.js";

export function registerOptimizeCommand(program: Command): void {
  program
    .command("optimize")
    .description("Remove dead and redundant MCP servers from config")
    .option("--config <path>", "Path to MCP config file")
    .option("--json", "Output JSON to stdout")
    .option("--out <dir>", "Custom output directory")
    .option("--apply", "Write changes to config (default: dry-run)")
    .option("--backup", "Backup original config before writing")
    .option("--cached", "Use cached plan instead of fresh scan")
    .option("--no-remove-dead", "Skip dead server removal")
    .option("--no-consolidate", "Skip redundant server removal")
    .action(async (opts) => {
      const spinner = ora("Loading configuration...").start();

      let plan: PlanReport;
      let scan: ScanResult;
      try {
        const result = await runPlanPipeline({
          config: opts.config,
          cached: opts.cached,
          out: opts.out,
          spinner,
        });
        plan = result.plan;
        scan = result.scan;
      } catch (err) {
        spinner.fail((err as Error).message);
        process.exit(1);
      }

      spinner.text = "Computing optimizations...";

      // Compute actions from analysis
      const { actions, manualFindings } = computeOptimizeActions(
        plan,
        { mcpServers: Object.fromEntries(scan.servers.map((s) => [s.server, {}])) },
        {
          removeDead: opts.removeDead !== false,
          consolidate: opts.consolidate !== false,
        },
      );

      // Multi-source guard: filter actions to only those in the target config file
      let applicableActions = actions;
      let allFindings = manualFindings;

      try {
        const rawConfig = await readRawConfig(plan.inputs.config_path);
        const { applicable, extraFindings } = filterActionsForFile(
          rawConfig,
          actions,
        );
        applicableActions = applicable;
        allFindings = [...manualFindings, ...extraFindings];

        // Apply if requested
        if (opts.apply && applicableActions.length > 0) {
          spinner.text = "Applying optimizations...";
          await applyOptimizations(rawConfig, applicableActions, {
            configPath: plan.inputs.config_path,
            backup: !!opts.backup,
          });
        }
      } catch (err) {
        if (opts.apply) {
          spinner.fail((err as Error).message);
          process.exit(1);
        }
        // In dry-run mode, config read failure is non-fatal
      }

      spinner.stop();

      const serversBefore = scan.servers.map((s) => s.server);
      const removedSet = new Set(applicableActions.map((a) => a.server));
      const serversAfter = serversBefore.filter((s) => !removedSet.has(s));

      const result: OptimizeResult = {
        version: 1,
        timestamp: new Date().toISOString(),
        config_path: plan.inputs.config_path,
        actions: applicableActions,
        manual_findings: allFindings,
        servers_before: serversBefore,
        servers_after: serversAfter,
        total_token_savings: applicableActions.reduce(
          (sum, a) => sum + a.token_savings,
          0,
        ),
        applied: !!opts.apply && applicableActions.length > 0,
        backup_path: opts.backup
          ? `${plan.inputs.config_path}.backup`
          : null,
      };

      // Output
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        const dryRun = !opts.apply;
        console.log(renderOptimizeResult(result, dryRun));
        const dir = await writeOptimizeArtifact(result, dryRun, opts.out);
        console.log(`  Artifacts written to ${chalk.dim(dir)}`);
        console.log("");
      }
    });
}
