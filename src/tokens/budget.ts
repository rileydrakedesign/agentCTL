import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type {
  ScanResult,
  TokenBudget,
  RuntimeTarget,
  RuntimeTargetReport,
} from "../types.js";
import { countTokens, getModelScale } from "./tokenizer.js";

const TYPICAL_ACTIVATION_RATE = 0.3;

/** Compute token budgets from scan results, prompt files, and skills. */
export async function computeBudgets(
  scan: ScanResult,
  promptFiles: string[],
  targets: RuntimeTarget[],
  skillTokens: number = 0,
): Promise<{ budgets: TokenBudget; target_reports: RuntimeTargetReport[] }> {
  const discovery_tokens = scan.servers.reduce(
    (sum, s) => sum + s.tools.reduce((t, tool) => t + tool.token_estimate.total, 0),
    0,
  );

  const prompt_tokens = await countPromptTokens(promptFiles);
  const skill_tokens = skillTokens;

  const typical_activation_tokens = Math.round(
    discovery_tokens * TYPICAL_ACTIVATION_RATE,
  );
  const worst_case_tokens = discovery_tokens;

  const baseTokens = discovery_tokens + prompt_tokens + skill_tokens;

  const budgets: TokenBudget = {
    discovery_tokens,
    prompt_tokens,
    skill_tokens,
    typical_activation_tokens,
    worst_case_tokens,
    total_typical: baseTokens + typical_activation_tokens,
    total_worst_case: baseTokens + worst_case_tokens,
  };

  const target_reports = targets.map((target) => {
    const scale = getModelScale(target.model);
    const scaled_discovery = Math.round(discovery_tokens * scale);
    const scaled_typical = Math.round(budgets.total_typical * scale);
    const scaled_worst = Math.round(budgets.total_worst_case * scale);

    return {
      model: target.model,
      context_window: target.context_window,
      discovery_usage_pct: round((scaled_discovery / target.context_window) * 100),
      typical_usage_pct: round((scaled_typical / target.context_window) * 100),
      worst_case_usage_pct: round((scaled_worst / target.context_window) * 100),
      fits: scaled_worst <= target.context_window,
    };
  });

  return { budgets, target_reports };
}

async function countPromptTokens(files: string[]): Promise<number> {
  let total = 0;
  for (const file of files) {
    try {
      const content = await readFile(resolve(file), "utf-8");
      total += countTokens(content);
    } catch {
      // File missing — skip silently, doctor will catch this
    }
  }
  return total;
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
