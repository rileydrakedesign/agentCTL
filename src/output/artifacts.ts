import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { renderPlanReport } from "./terminal.js";
import type { ScanResult, PlanReport } from "../types.js";

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
