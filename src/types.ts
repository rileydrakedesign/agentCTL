// ── MCP Config ──────────────────────────────────────────────

export interface McpServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
}

export interface McpConfig {
  mcpServers: Record<string, McpServerConfig>;
}

// ── agentctl.yaml ───────────────────────────────────────────

export interface RuntimeTarget {
  model: string;
  context_window: number;
}

export interface ProjectConfig {
  version: number;
  project: {
    name: string;
  };
  runtime_targets: RuntimeTarget[];
}

// ── Discovery ───────────────────────────────────────────────

export interface TokenEstimate {
  description_tokens: number;
  schema_tokens: number;
  total: number;
}

export interface DiscoveredTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  token_estimate: TokenEstimate;
}

export type ServerStatus = "ok" | "error";
export type Transport = "stdio" | "sse";

export interface Diagnostic {
  server: string;
  type: "auth_failure" | "connectivity_failure" | "timeout" | "parse_error";
  message: string;
}

export interface ServerScanResult {
  server: string;
  status: ServerStatus;
  transport: Transport;
  tools: DiscoveredTool[];
  latency_ms: number;
  diagnostics: Diagnostic[];
}

export interface ScanResult {
  version: number;
  timestamp: string;
  servers: ServerScanResult[];
}

// ── Skills ──────────────────────────────────────────────────

export interface ParsedSkill {
  name: string;
  path: string;
  content: string;
  token_count: number;
}

// ── Token Budget ────────────────────────────────────────────

export interface TokenBudget {
  discovery_tokens: number;
  prompt_tokens: number;
  skill_tokens: number;
  typical_activation_tokens: number;
  worst_case_tokens: number;
  total_typical: number;
  total_worst_case: number;
}

export interface RuntimeTargetReport {
  model: string;
  context_window: number;
  discovery_usage_pct: number;
  typical_usage_pct: number;
  worst_case_usage_pct: number;
  fits: boolean;
}

// ── Analysis ────────────────────────────────────────────────

export interface RedundancyCluster {
  tools: string[];
  similarity: number;
  token_savings_if_consolidated: number;
}

export interface DeadCapability {
  server: string;
  tool: string;
  reason: string;
}

export interface ContextWarning {
  message: string;
  severity: "warning" | "error";
}

export interface Analysis {
  redundancy_clusters: RedundancyCluster[];
  dead_capabilities: DeadCapability[];
  warnings: ContextWarning[];
}

// ── Workspace ───────────────────────────────────────────────

export interface McpCost {
  tools: number;
  tokens: number;
}

export interface WorkspaceMetrics {
  mcp_count: number;
  tool_count: number;
  discovery_tokens: number;
  prompt_tokens: number;
  total_projected: number;
  waste_percentage: number;
  mcp_costs: Record<string, McpCost>;
  redundancy_clusters: RedundancyCluster[];
  warnings: string[];
}

// ── Plan Report ─────────────────────────────────────────────

export type PlanStatus = "success" | "partial" | "failed";

export interface PlanReport {
  version: number;
  status: PlanStatus;
  project: string;
  timestamp: string;
  inputs: {
    config_path: string;
    skill_dirs: string[];
    prompt_files: string[];
  };
  capabilities: {
    mcp_servers: number;
    mcp_tools: number;
    skills: number;
  };
  budgets: TokenBudget;
  runtime_targets: RuntimeTargetReport[];
  workspace: WorkspaceMetrics;
  analysis: Analysis;
  recommendations: string[];
  diagnostics: Diagnostic[];
}
