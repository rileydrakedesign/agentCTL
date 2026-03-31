import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { renderPlanReport } from "./terminal.js";
import { renderDiffReport } from "./diff-terminal.js";
import { renderOptimizeResult } from "./optimize-terminal.js";
import type { ScanResult, PlanReport, DiffReport, OptimizeResult } from "../types.js";

const DEFAULT_DIR = ".agentctl/latest";

/** Strip ANSI escape codes from a string. */
function stripAnsi(text: string): string {
  return text.replace(/\x1B\[[0-9;]*m/g, "");
}

/** Write scan-only artifact (scan.json). */
export async function writeScanArtifact(
  scan: ScanResult,
  outDir?: string,
): Promise<string> {
  const dir = resolve(outDir ?? DEFAULT_DIR);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "scan.json"), JSON.stringify(scan, null, 2));
  return dir;
}

/** Write full plan artifact bundle. */
export async function writeArtifacts(
  plan: PlanReport,
  scan: ScanResult,
  outDir?: string,
): Promise<string> {
  const dir = resolve(outDir ?? DEFAULT_DIR);
  await mkdir(dir, { recursive: true });

  const summaryText = stripAnsi(renderPlanReport(plan));

  await Promise.all([
    writeFile(join(dir, "scan.json"), JSON.stringify(scan, null, 2)),
    writeFile(join(dir, "plan.json"), JSON.stringify(plan, null, 2)),
    writeFile(
      join(dir, "diagnostics.json"),
      JSON.stringify(plan.diagnostics, null, 2),
    ),
    writeFile(
      join(dir, "recommendations.json"),
      JSON.stringify(plan.recommendations, null, 2),
    ),
    writeFile(join(dir, "summary.txt"), summaryText),
  ]);

  return dir;
}

/** Write diff artifact bundle. */
export async function writeDiffArtifacts(
  diff: DiffReport,
  basePlan: PlanReport,
  headPlan: PlanReport,
  headScan: ScanResult,
  outDir?: string,
): Promise<string> {
  const dir = resolve(outDir ?? DEFAULT_DIR);
  await mkdir(dir, { recursive: true });

  const summaryText = stripAnsi(renderDiffReport(diff));

  await Promise.all([
    writeFile(join(dir, "diff.json"), JSON.stringify(diff, null, 2)),
    writeFile(join(dir, "diff-base-plan.json"), JSON.stringify(basePlan, null, 2)),
    writeFile(join(dir, "plan.json"), JSON.stringify(headPlan, null, 2)),
    writeFile(join(dir, "scan.json"), JSON.stringify(headScan, null, 2)),
    writeFile(
      join(dir, "diagnostics.json"),
      JSON.stringify(headPlan.diagnostics, null, 2),
    ),
    writeFile(join(dir, "diff-summary.txt"), summaryText),
  ]);

  return dir;
}

/** Write optimize artifact (optimize.json + summary). */
export async function writeOptimizeArtifact(
  result: OptimizeResult,
  dryRun: boolean,
  outDir?: string,
): Promise<string> {
  const dir = resolve(outDir ?? DEFAULT_DIR);
  await mkdir(dir, { recursive: true });

  const summaryText = stripAnsi(renderOptimizeResult(result, dryRun));

  await Promise.all([
    writeFile(join(dir, "optimize.json"), JSON.stringify(result, null, 2)),
    writeFile(join(dir, "optimize-summary.txt"), summaryText),
  ]);

  return dir;
}
