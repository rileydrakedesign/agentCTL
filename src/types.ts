// ── MCP Config ──────────────────────────────────────────────

export interface McpServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  type?: "stdio" | "sse" | "http";
  headers?: Record<string, string>;
  oauth?: boolean;
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
export type Transport = "stdio" | "sse" | "http";

export interface Diagnostic {
  server: string;
  type: "auth_failure" | "connectivity_failure" | "timeout" | "parse_error" | "oauth_required";
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

// ── Diff ───────────────────────────────────────────────

export interface NumericDelta {
  base: number;
  head: number;
  delta: number;
  delta_pct: number;
}

export interface ServerDelta {
  name: string;
  tools_delta: number;
  tokens_delta: number;
  tools_added: string[];
  tools_removed: string[];
}

export interface DiffReport {
  version: number;
  timestamp: string;
  base_ref: string;
  head_ref: string;
  servers: {
    added: Array<{ name: string; tools: number; tokens: number }>;
    removed: Array<{ name: string; tools: number; tokens: number }>;
    changed: ServerDelta[];
  };
  budgets: {
    discovery_tokens: NumericDelta;
    prompt_tokens: NumericDelta;
    total_typical: NumericDelta;
    total_worst_case: NumericDelta;
  };
  analysis: {
    redundancy_new: RedundancyCluster[];
    redundancy_resolved: RedundancyCluster[];
    waste_pct: NumericDelta;
  };
  model_fit: Array<{
    model: string;
    base_typical_pct: number;
    head_typical_pct: number;
    base_fits: boolean;
    head_fits: boolean;
  }>;
  exit_result?: {
    pass: boolean;
    rules_evaluated: string[];
  };
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

// ── Agentic Workspace ──────────────────────────────────

export interface InstructionFile {
  path: string;
  depth: number;
  token_count: number;
  scope: "root" | "nested" | "claude-dir";
}

export interface SkillEntry {
  name: string;
  path: string;
  token_count: number;
  has_instruction: boolean;
}

export interface McpEntry {
  name: string;
  source: string;
  transport: Transport;
  tool_count: number;
  token_cost: number;
}

export interface AgenticNode {
  type: "instruction" | "skill" | "mcp-config" | "skill-dir" | "claude-dir";
  path: string;
  label: string;
  children?: AgenticNode[];
  meta?: Record<string, string | number>;
}

export interface AgenticWorkspaceView {
  root: string;
  instruction_files: InstructionFile[];
  skills: SkillEntry[];
  mcp_servers: McpEntry[];
  tree: AgenticNode[];
  summary: {
    total_instruction_files: number;
    total_instruction_tokens: number;
    total_skills: number;
    total_skill_tokens: number;
    total_mcp_servers: number;
    total_mcp_tools: number;
    total_mcp_tokens: number;
    deepest_instruction_depth: number;
  };
}

// ── Optimize ───────────────────────────────────────────

export type OptimizeActionType = "remove_dead_server" | "remove_redundant_server";

export interface OptimizeAction {
  type: OptimizeActionType;
  server: string;
  rationale: string;
  token_savings: number;
}

export interface ManualFinding {
  server: string;
  tool: string;
  issue: "dead_tool" | "partial_redundancy";
  detail: string;
}

export interface OptimizeResult {
  version: 1;
  timestamp: string;
  config_path: string;
  actions: OptimizeAction[];
  manual_findings: ManualFinding[];
  servers_before: string[];
  servers_after: string[];
  total_token_savings: number;
  applied: boolean;
  backup_path: string | null;
}
