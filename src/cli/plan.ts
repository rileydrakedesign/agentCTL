import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import chalk from "chalk";
import ora from "ora";
import type { Ora } from "ora";
import type { Command } from "commander";
import { discoverInputs } from "../config/discover.js";
import { loadProjectConfig } from "../config/parse.js";
import { scanServer } from "../mcp/client.js";
import { computeBudgets } from "../tokens/budget.js";
import { detectRedundancy } from "../analysis/redundancy.js";
import { detectDeadCapabilities } from "../analysis/dead-caps.js";
import { detectPressure } from "../analysis/pressure.js";
import { computeWorkspaceMetrics } from "../workspace/metrics.js";
import { writeArtifacts } from "../output/artifacts.js";
import { renderPlanReport } from "../output/terminal.js";
import { formatPlanJson } from "../output/json.js";
import { parseSkillDirs } from "../skills/parse.js";
import type { ScanResult, PlanReport, PlanStatus } from "../types.js";

export interface PipelineOptions {
  config?: string;
  models?: string;
  cached?: boolean;
  out?: string;
  spinner?: Ora;
}

/**
 * Run the full plan pipeline: discover → scan → budget → analysis → report.
 * Used by both the `plan` and `diff` commands.
 */
export async function runPlanPipeline(
  opts: PipelineOptions = {},
): Promise<{ plan: PlanReport; scan: ScanResult }> {
  const spinner = opts.spinner;

  // Load project config
  const projectConfig = await loadProjectConfig();

  // Override models if provided
  if (opts.models) {
    const models = opts.models
      .split(",")
      .map((m) => m.trim())
      .filter((m) => m.length > 0);
    if (models.length === 0) {
      throw new Error("--models requires at least one model name.");
    }
    projectConfig.runtime_targets = models.map((model) => ({
      model,
      context_window: guessContextWindow(model),
    }));
  }

  // Discover inputs
  if (spinner) spinner.text = "Discovering inputs...";
  const inputs = await discoverInputs(opts.config);

  // Get scan results
  let scan: ScanResult;

  if (opts.cached) {
    const cachedPath = resolve(opts.out ?? ".agentctl/latest", "scan.json");
    if (!existsSync(cachedPath)) {
      throw new Error("No cached scan found. Run `agentctl scan` first.");
    }
    scan = JSON.parse(await readFile(cachedPath, "utf-8"));
    if (spinner) spinner.text = "Using cached scan...";
  } else {
    const serverNames = Object.keys(inputs.config.mcpServers);
    if (spinner) spinner.text = `Scanning ${serverNames.length} MCP servers...`;

    const results = await Promise.allSettled(
      serverNames.map((name) =>
        scanServer(name, inputs.config.mcpServers[name]),
      ),
    );

    scan = {
      version: 1,
      timestamp: new Date().toISOString(),
      servers: results.map((r, i) => {
        if (r.status === "fulfilled") return r.value;
        return {
          server: serverNames[i],
          status: "error" as const,
          transport: "stdio" as const,
          tools: [],
          latency_ms: 0,
          diagnostics: [
            {
              server: serverNames[i],
              type: "connectivity_failure" as const,
              message: r.reason?.message ?? "Unknown error",
            },
          ],
        };
      }),
    };
  }

  // Parse skills
  if (spinner) spinner.text = "Parsing skills...";
  const parsedSkills = await parseSkillDirs(inputs.skill_dirs);
  const skillTokens = parsedSkills.reduce((sum, s) => sum + s.token_count, 0);

  // Compute budgets
  if (spinner) spinner.text = "Computing token budgets...";
  const { budgets, target_reports } = await computeBudgets(
    scan,
    inputs.prompt_files,
    projectConfig.runtime_targets,
    skillTokens,
  );

  // Analysis
  if (spinner) spinner.text = "Running analysis...";
  const redundancy_clusters = detectRedundancy(scan.servers);
  const dead_capabilities = detectDeadCapabilities(scan.servers);
  const pressure_warnings = detectPressure(
    scan,
    budgets,
    projectConfig.runtime_targets,
  );

  // Workspace metrics
  const workspace = computeWorkspaceMetrics(
    scan,
    budgets,
    redundancy_clusters,
    dead_capabilities,
  );

  // Build recommendations
  const recommendations = buildRecommendations(
    scan,
    redundancy_clusters,
    dead_capabilities,
    workspace,
  );

  // Determine status
  const allDiagnostics = scan.servers.flatMap((s) => s.diagnostics);
  let status: PlanStatus = "success";
  if (allDiagnostics.length > 0 && scan.servers.some((s) => s.status === "ok")) {
    status = "partial";
  } else if (scan.servers.every((s) => s.status === "error")) {
    status = "failed";
  }

  const plan: PlanReport = {
    version: 1,
    status,
    project: projectConfig.project.name,
    timestamp: new Date().toISOString(),
    inputs: {
      config_path: inputs.config_path,
      skill_dirs: inputs.skill_dirs,
      prompt_files: inputs.prompt_files,
    },
    capabilities: {
      mcp_servers: scan.servers.length,
      mcp_tools: scan.servers.reduce((sum, s) => sum + s.tools.length, 0),
      skills: parsedSkills.length,
    },
    budgets,
    runtime_targets: target_reports,
    workspace,
    analysis: {
      redundancy_clusters,
      dead_capabilities,
      warnings: pressure_warnings,
    },
    recommendations,
    diagnostics: allDiagnostics,
  };

  return { plan, scan };
}

export function registerPlanCommand(program: Command): void {
  program
    .command("plan")
    .description("Analyze capabilities and produce token budget report")
    .option("--config <path>", "Path to MCP config file")
    .option("--json", "Output JSON to stdout")
    .option("--out <dir>", "Custom output directory")
    .option("--cached", "Use last scan instead of re-scanning")
    .option("--models <list>", "Comma-separated model list override")
    .option("--fail-on <level>", "Exit non-zero on warnings or errors", "off")
    .option("--max-discovery-tokens <n>", "Fail if discovery exceeds budget", parseInt)
    .action(async (opts) => {
      const spinner = ora("Loading configuration...").start();

      let plan: PlanReport;
      let scan: ScanResult;
      try {
        const result = await runPlanPipeline({
          config: opts.config,
          models: opts.models,
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

      spinner.stop();

      // Output
      if (opts.json) {
        console.log(formatPlanJson(plan));
      } else {
        console.log(renderPlanReport(plan));
        const dir = await writeArtifacts(plan, scan, opts.out);
        console.log(`  Artifacts written to ${chalk.dim(dir)}`);
        console.log("");
      }

      // Exit codes
      if (opts.maxDiscoveryTokens && plan.budgets.discovery_tokens > opts.maxDiscoveryTokens) {
        console.error(
          chalk.red(
            `Discovery tokens (${plan.budgets.discovery_tokens}) exceed budget (${opts.maxDiscoveryTokens})`,
          ),
        );
        process.exit(1);
      }

      if (opts.failOn === "error" && plan.status === "failed") {
        process.exit(1);
      }
      if (opts.failOn === "warning" && (plan.status !== "success" || plan.analysis.warnings.length > 0)) {
        process.exit(1);
      }
    });
}

function guessContextWindow(model: string): number {
  const lower = model.toLowerCase();
  if (lower.includes("claude")) return 200_000;
  if (lower.includes("gpt-4o")) return 128_000;
  if (lower.includes("gemini")) return 1_000_000;
  return 128_000;
}

function buildRecommendations(
  scan: ScanResult,
  clusters: import("../types.js").RedundancyCluster[],
  deadCaps: import("../types.js").DeadCapability[],
  workspace: import("../types.js").WorkspaceMetrics,
): string[] {
  const recs: string[] = [];

  // Large MCP servers
  for (const [name, cost] of Object.entries(workspace.mcp_costs)) {
    if (cost.tools > 20) {
      recs.push(
        `Review ${name} MCP: ${cost.tools} tools contributing ${cost.tokens.toLocaleString()} tokens`,
      );
    }
  }

  // Redundancy
  for (const cluster of clusters) {
    recs.push(`Consolidate: ${cluster.tools.join(" <-> ")}`);
  }

  // Dead capabilities
  const deadWithTokens = deadCaps.filter((d) => d.tool !== "*");
  if (deadWithTokens.length > 0) {
    recs.push(
      `Remove: ${deadWithTokens.length} tool${deadWithTokens.length > 1 ? "s" : ""} with empty descriptions (0 value)`,
    );
  }

  return recs;
}
