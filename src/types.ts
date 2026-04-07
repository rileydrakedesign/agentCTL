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

// ── Context Surface ─────────────────────────────────────────

export type PlatformName = "claude-code" | "cursor" | "windsurf" | "generic";

export interface PlatformProfile {
  name: PlatformName;
  root_instruction_files: string[];
  rules_patterns: string[];
  skill_directories: string[];
  config_files: string[];
  supports_hooks: boolean;
  supports_mdc: boolean;
  supports_custom_instructions: boolean;
}

export type SurfaceLayerType =
  | "root_instruction"
  | "parent_instruction"
  | "rules_file"
  | "mcp_tool_definitions"
  | "skill"
  | "custom_instructions"
  | "hook_output"
  | "ide_config"
  | "project_config";

export interface SurfaceLayer {
  layer_type: SurfaceLayerType;
  source_path: string;
  token_count: number;
  platform: string;
  always_present: boolean;
  activation_condition?: string;
}

export interface SurfaceCompositionEntry {
  count: number;
  tokens: number;
  percentage: number;
}

export interface ContextSurface {
  platform: PlatformName;
  layers: SurfaceLayer[];
  total_tokens: number;
  core_tokens: number;
  conditional_tokens: number;
  composition: Partial<Record<SurfaceLayerType, SurfaceCompositionEntry>>;
  pressure: {
    model: string;
    context_window: number;
    surface_pct: number;
    remaining_tokens: number;
  };
}

// ── References ──────────────────────────────────────────────

export type ReferenceType =
  | "lat_annotation"
  | "lat_file"
  | "wiki_link"
  | "explicit_path"
  | "glob_match"
  | "mcp_name_mention"
  | "skill_name_mention"
  | "semantic_mention";

export interface AgenticReference {
  source: string;
  target: string;
  target_type: "instruction" | "skill" | "mcp" | "rules" | "file" | "unknown";
  reference_type: ReferenceType;
  confidence: number;
  context: string;
  line_number?: number;
  verified: boolean;
  category: "structural" | "semantic";
}

// ── Reference Graph ─────────────────────────────────────────

export interface ConnectivityStatus {
  object_id: string;
  object_type: "instruction" | "skill" | "mcp" | "rules";
  linked: boolean;
  degrees_from_surface: number | null;
  reference_chain: string[];
  referenced_by: AgenticReference[];
  references: AgenticReference[];
  structural_ref_count: number;
  semantic_ref_count: number;
}

export interface ReferenceGraphSummary {
  total_nodes: number;
  linked_nodes: number;
  unlinked_nodes: number;
  connectivity_pct: number;
  max_depth: number;
  structural_edges: number;
  semantic_edges: number;
  lat_edges: number;
  broken_edges: number;
}

export interface ReferenceGraph {
  context_surface_nodes: string[];
  nodes: ConnectivityStatus[];
  edges: AgenticReference[];
  broken_references: AgenticReference[];
  summary: ReferenceGraphSummary;
}

// ── Staleness ───────────────────────────────────────────────

export type StalenessType =
  | "broken_reference"
  | "dead_glob"
  | "missing_skill_dir"
  | "missing_dependency"
  | "missing_env_var"
  | "dead_path_reference";

export interface StaleEntity {
  source: string;
  line_number?: number;
  staleness_type: StalenessType;
  stale_target: string;
  confidence: number;
  detail: string;
  tier: 1 | 2 | 3;
}

export interface RulesFile {
  path: string;
  platform: "cursor" | "windsurf" | "generic";
  token_count: number;
  glob_patterns?: string[];
  description?: string;
  always_active: boolean;
}

// ── Contradictions ──────────────────────────────────────────

export type ConflictSeverity = "error" | "warning" | "info";
export type ConflictClass = "hard_conflict" | "scope_override" | "tool_overlap";

export interface Contradiction {
  file_a: string;
  file_b: string;
  directive_a: string;
  directive_b: string;
  line_a?: number;
  line_b?: number;
  topic: string;
  classification: ConflictClass;
  severity: ConflictSeverity;
  explanation: string;
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
  context_surface?: ContextSurface;
  reference_graph?: {
    connectivity_pct: number;
    linked: number;
    unlinked: number;
    broken_references: number;
    unlinked_entities: string[];
  };
  staleness?: StaleEntity[];
  contradictions?: Contradiction[];
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
