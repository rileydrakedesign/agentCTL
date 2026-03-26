import type { PlanReport, ScanResult } from "../types.js";

/** Format scan result as JSON string for --json output. */
export function formatScanJson(scan: ScanResult): string {
  return JSON.stringify(scan, null, 2);
}

/** Format plan report as JSON string for --json output. */
export function formatPlanJson(plan: PlanReport): string {
  return JSON.stringify(plan, null, 2);
}
