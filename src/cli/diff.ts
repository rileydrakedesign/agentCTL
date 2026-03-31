import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import chalk from "chalk";
import ora from "ora";
import type { Command } from "commander";
import { runPlanPipeline } from "./plan.js";
import { isGitRef, createWorktree, removeWorktree } from "../diff/worktree.js";
import { computeDiffWithScans } from "../diff/compute.js";
import { writeDiffArtifacts } from "../output/artifacts.js";
import { renderDiffReport } from "../output/diff-terminal.js";
import type { PlanReport, ScanResult, DiffReport } from "../types.js";

export function registerDiffCommand(program: Command): void {
  program
    .command("diff")
    .description("Compare capability snapshots between git refs or against last plan")
    .option("--base <ref>", "Git ref or plan artifact to compare against")
    .option("--config <path>", "Path to MCP config file")
    .option("--json", "Output JSON to stdout")
    .option("--out <dir>", "Custom output directory")
    .option("--models <list>", "Comma-separated model list override")
    .option("--fail-on-increase <pct>", "Fail if discovery tokens increase by more than N%", parseFloat)
    .option("--fail-on-new-redundancy", "Fail if new redundancy clusters are introduced")
    .option("--fail-on-regression", "Fail if any metric regresses")
    .action(async (opts) => {
      const spinner = ora("Preparing diff...").start();

      // ── Resolve base plan ──────────────────────────────
      let basePlan: PlanReport;
      let baseScan: ScanResult;
      let baseRef: string;

      if (opts.base) {
        // Check if it's a git ref
        if (await isGitRef(opts.base)) {
          baseRef = opts.base;
          spinner.text = `Creating worktree for ${baseRef}...`;

          let worktreePath: string | undefined;
          try {
            worktreePath = await createWorktree(baseRef);
            spinner.text = `Scanning base (${baseRef})...`;

            // Run pipeline in the worktree directory
            const originalCwd = process.cwd();
            process.chdir(worktreePath);
            try {
              const baseResult = await runPlanPipeline({
                config: opts.config,
                models: opts.models,
                spinner,
              });
              basePlan = baseResult.plan;
              baseScan = baseResult.scan;
            } finally {
              process.chdir(originalCwd);
            }
          } finally {
            if (worktreePath) {
              await removeWorktree(worktreePath);
            }
          }
        } else {
          // Treat as a path to a plan.json artifact
          const planPath = resolve(opts.base, "plan.json");
          const scanPath = resolve(opts.base, "scan.json");
          if (!existsSync(planPath)) {
            spinner.fail(`No plan found at ${planPath}. Provide a git ref or artifact directory.`);
            process.exit(1);
          }
          basePlan = JSON.parse(await readFile(planPath, "utf-8"));
          baseScan = existsSync(scanPath)
            ? JSON.parse(await readFile(scanPath, "utf-8"))
            : { version: 1, timestamp: basePlan.timestamp, servers: [] };
          baseRef = opts.base;
        }
      } else {
        // No --base: use last saved plan
        const defaultDir = resolve(opts.out ?? ".agentctl/latest");
        const planPath = resolve(defaultDir, "plan.json");
        const scanPath = resolve(defaultDir, "scan.json");
        if (!existsSync(planPath)) {
          spinner.fail("No previous plan found. Run `agentctl plan` first, or use --base <ref>.");
          process.exit(1);
        }
        basePlan = JSON.parse(await readFile(planPath, "utf-8"));
        baseScan = existsSync(scanPath)
          ? JSON.parse(await readFile(scanPath, "utf-8"))
          : { version: 1, timestamp: basePlan.timestamp, servers: [] };
        baseRef = "last-plan";
      }

      // ── Resolve head plan (current state) ──────────────
      spinner.text = "Scanning current state...";

      let headPlan: PlanReport;
      let headScan: ScanResult;
      try {
        const headResult = await runPlanPipeline({
          config: opts.config,
          models: opts.models,
          spinner,
        });
        headPlan = headResult.plan;
        headScan = headResult.scan;
      } catch (err) {
        spinner.fail((err as Error).message);
        process.exit(1);
      }

      // ── Compute diff ──────────────────────────────────
      spinner.text = "Computing diff...";
      const headRef = "current";

      const diff: DiffReport = computeDiffWithScans(
        basePlan,
        headPlan,
        baseScan,
        headScan,
        baseRef,
        headRef,
      );

      // ── Evaluate exit rules ───────────────────────────
      const rules: string[] = [];
      let pass = true;

      if (opts.failOnIncrease !== undefined) {
        const pct = diff.budgets.discovery_tokens.delta_pct;
        const rule = `discovery_increase <= ${opts.failOnIncrease}%`;
        rules.push(rule);
        if (pct > opts.failOnIncrease) {
          pass = false;
        }
      }

      if (opts.failOnNewRedundancy) {
        const rule = "no_new_redundancy";
        rules.push(rule);
        if (diff.analysis.redundancy_new.length > 0) {
          pass = false;
        }
      }

      if (opts.failOnRegression) {
        const rule = "no_regression";
        rules.push(rule);
        if (
          diff.budgets.discovery_tokens.delta > 0 ||
          diff.analysis.waste_pct.delta > 0 ||
          diff.analysis.redundancy_new.length > 0
        ) {
          pass = false;
        }
      }

      if (rules.length > 0) {
        diff.exit_result = { pass, rules_evaluated: rules };
      }

      spinner.stop();

      // ── Output ────────────────────────────────────────
      if (opts.json) {
        console.log(JSON.stringify(diff, null, 2));
      } else {
        console.log(renderDiffReport(diff));
        const dir = await writeDiffArtifacts(diff, basePlan, headPlan, headScan, opts.out);
        console.log(`  Artifacts written to ${chalk.dim(dir)}`);
        console.log("");
      }

      // ── Exit code ─────────────────────────────────────
      if (rules.length > 0 && !pass) {
        const failed = rules.filter((_, i) => {
          if (i === 0 && opts.failOnIncrease !== undefined) {
            return diff.budgets.discovery_tokens.delta_pct > opts.failOnIncrease;
          }
          if (opts.failOnNewRedundancy && rules[i] === "no_new_redundancy") {
            return diff.analysis.redundancy_new.length > 0;
          }
          if (opts.failOnRegression && rules[i] === "no_regression") {
            return (
              diff.budgets.discovery_tokens.delta > 0 ||
              diff.analysis.waste_pct.delta > 0 ||
              diff.analysis.redundancy_new.length > 0
            );
          }
          return false;
        });
        console.error(chalk.red(`Failed rules: ${failed.join(", ")}`));
        process.exit(1);
      }
    });
}
