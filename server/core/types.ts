/**
 * Agent Deck v1.0 - Core Type Definitions
 *
 * Single source of truth for all types used across server and client.
 */

// =====================================================
// Agent Status (9 states)
// =====================================================

export type AgentStatus =
  | "pending"
  | "queued"
  | "running"
  | "idle"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled"
  | "dead";

export type RuntimeType = "claude-code" | "codex" | "opencode";

// =====================================================
// Agent Config (used for spawn + persistence)
// =====================================================

export interface AgentConfig {
  name: string;
  prompt: string;
  model?: string;
  workspace?: string;
  agent_type?: string;
  runtime?: RuntimeType;
  interactive?: boolean;
  resumeSessionId?: string;
  // v1.0 additions
  maxBudgetUsd?: number;
  maxRetries?: number;
  failureStrategy?: FailureStrategy;
  env?: Record<string, string>;
}

// Backwards compat alias
export type SpawnAgentConfig = AgentConfig;

export type FailureStrategy = "abort-downstream" | "retry" | "skip" | "continue";

// =====================================================
// Agent Record (DB row)
// =====================================================

export interface Agent {
  id: string;
  name: string;
  agent_type: string;
  pid: number | null;
  status: AgentStatus;
  model: string;
  workspace_path: string;
  prompt: string;
  started_at: string;
  last_event_at: string | null;
  total_cost_usd: number;
  total_input_tokens: number;
  total_output_tokens: number;
  visible: boolean;
  interactive: boolean;
  session_id: string | null;
  runtime: RuntimeType;
}

// Legacy alias
export type DeckAgent = Agent;

// =====================================================
// Events
// =====================================================

export interface AgentEvent {
  id: number;
  agent_id: string;
  event_type: string;
  tool_name: string | null;
  content: string | null;
  cost_usd: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  created_at: string;
}

export type DeckEvent = AgentEvent;

// =====================================================
// Stream Events (from CLI --output-format stream-json)
// =====================================================

export type StreamEventType =
  | "init"
  | "text"
  | "tool_call"
  | "tool_result"
  | "thinking"
  | "heartbeat"
  | "complete"
  | "error"
  | "prompt";

export interface StreamEvent {
  type: StreamEventType;
  agentId: string;
  timestamp: string;
  data: unknown;
}

export interface InitEvent extends StreamEvent {
  type: "init";
  data: { sessionId: string };
}

export interface TextEvent extends StreamEvent {
  type: "text";
  data: { content: string; isPartial?: boolean };
}

export interface ToolCallEvent extends StreamEvent {
  type: "tool_call";
  data: { toolId: string; toolName: string; toolInput: unknown };
}

export interface ToolResultEvent extends StreamEvent {
  type: "tool_result";
  data: { toolId: string; content: string; isError?: boolean };
}

export interface ThinkingEvent extends StreamEvent {
  type: "thinking";
  data: { content: string; isPartial?: boolean };
}

/** The CLI's non-interactive stream-json mode never emits incremental
 *  thinking/text deltas — extended-thinking blocks arrive redacted (empty
 *  `thinking` text). This is the only progress signal available during
 *  those silent stretches, so it's surfaced rather than dropped. */
export interface HeartbeatEvent extends StreamEvent {
  type: "heartbeat";
  data: { estimatedTokens: number };
}

/** Synthetic, non-CLI event: the full instructions handed to the architect,
 *  emitted once up front so the UI can show what it was actually asked. */
export interface PromptEvent extends StreamEvent {
  type: "prompt";
  data: {
    content: string;
    stage?: "planner";
    model?: string;
    explorerModel?: string;
  };
}

export interface CompleteEvent extends StreamEvent {
  type: "complete";
  data: {
    status: "success" | "error" | "cancelled";
    error?: string;
    durationMs?: number;
    sessionId?: string;
    costUsd?: number;
    inputTokens?: number;
    outputTokens?: number;
  };
}

export interface ErrorEvent extends StreamEvent {
  type: "error";
  data: { code: string; message: string };
}

// =====================================================
// Claude CLI Raw Output Types
// =====================================================

export interface ClaudeCliEvent {
  type: string;
  subtype?: string;
  session_id?: string;
  estimated_tokens?: number;
  message?: {
    role: string;
    content: Array<{
      type: string;
      text?: string;
      id?: string;
      name?: string;
      input?: unknown;
      thinking?: string;
      tool_use_id?: string;
      content?: unknown;
      is_error?: boolean;
    }>;
    model?: string;
  };
  content_block?: {
    type: string;
    text?: string;
    id?: string;
    name?: string;
    input?: unknown;
    thinking?: string;
  };
  delta?: {
    type: string;
    text?: string;
    thinking?: string;
  };
  is_error?: boolean;
  duration_ms?: number;
  duration_api_ms?: number;
  num_turns?: number;
  result?: string;
  total_cost_usd?: number;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  error?: string;
}

// =====================================================
// Workflow Types
// =====================================================

export type WorkflowStatus =
  | "planning"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled"
  | "finalizing";

export type NodeStatus =
  | "pending"
  | "queued"
  | "running"
  | "success"
  | "failed"
  | "retrying"
  | "cancelled"
  | "skipped"
  | "paused";

export interface NodeState {
  agentName: string;
  config: AgentConfig;
  status: NodeStatus;
  cost: number;
  retryCount: number;
  agentId: string | null;
  error: string | null;
}

export interface WorkflowState {
  id: string;
  name: string;
  status: WorkflowStatus;
  nodes: Record<string, NodeState>;
  edges: Array<{ source: string; target: string; condition: string }>;
  totalCost: number;
  maxBudgetUsd: number;
  startedAt: number | null;
  completedAt: number | null;
}

// =====================================================
// Project Scanner Types
// =====================================================

export interface ProjectStructure {
  name: string;
  root: string;
  type: "monorepo" | "single";
  framework?: string;
  packages: PackageInfo[];
  hasClaudeMd: boolean;
  hasMcpJson: boolean;
  hasDeckYaml: boolean;
  agentCount: number;
  skillCount: number;
  mcpServerCount: number;
  gitBranch: string | null;
  gitStatus: string | null;
  language: string | null;
}

export interface PackageInfo {
  name: string;
  path: string;
  type: "app" | "library" | "config";
  framework?: string;
  dependencies: string[];
}

// =====================================================
// Mission Planner Types
// =====================================================

export interface MissionPlan {
  /** v1 executable task graph. New plans always use this field. */
  tasks?: PlannedTask[];
  /** Legacy plans remain readable and relaunchable. */
  agents?: PlannedAgent[];
  estimatedCost?: number;
  estimatedTimeMinutes?: number;
}

export type TaskComplexity = "low" | "medium" | "high";

export interface PlannedTask {
  id: string;
  title: string;
  /** Markdown instructions intentionally preserved without normalization. */
  prompt: string;
  workdir: string;
  dependsOn: string[];
  complexity: TaskComplexity;
  acceptanceCriteria: string[];
  /** Optional pre-launch override; otherwise routing selects a complexity model. */
  model?: string;
}

export interface PlannedAgent {
  name: string;
  task: string;
  role?: string;
  workdir: string;
  model?: string;
  runtime?: RuntimeType;
  dependsOn: string[];
}

// =====================================================
// Cost Types
// =====================================================

export interface DeckCostSnapshot {
  id: number;
  agent_id: string;
  model: string;
  cost_usd: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  recorded_at: string;
}

export interface CostSummary {
  total_cost_usd: number;
  today_cost_usd: number;
  active_agents: number;
  by_agent: Array<{
    agent_id: string;
    agent_name: string;
    cost_usd: number;
    input_tokens: number;
    output_tokens: number;
  }>;
}

// =====================================================
// Settings Types
// =====================================================

export interface DeckSettings {
  maxAgents: number;
  maxBudgetUsd: number;
  idleThresholdSeconds: number;
  activeRuntimes: RuntimeType[];
  plannerModel: string;
  explorerModel: string;
  lowComplexityModel: string;
  mediumComplexityModel: string;
  highComplexityModel: string;
  autoOpenBrowser: boolean;
  theme: "dark" | "light";
}

export const DEFAULT_SETTINGS: DeckSettings = {
  maxAgents: 10,
  maxBudgetUsd: 50,
  idleThresholdSeconds: 300,
  activeRuntimes: ["claude-code"],
  plannerModel: "sonnet",
  explorerModel: "haiku",
  lowComplexityModel: "haiku",
  mediumComplexityModel: "sonnet",
  highComplexityModel: "opus",
  autoOpenBrowser: true,
  theme: "dark",
};

// =====================================================
// WebSocket Message Types
// =====================================================

export type DeckIncomingMessage =
  | { type: "deck:subscribe" }
  | { type: "deck:agent:spawn"; config: AgentConfig }
  | { type: "deck:agent:kill"; agentId: string }
  | { type: "deck:agent:input"; agentId: string; text: string }
  | { type: "deck:agent:focus"; agentId: string }
  | { type: "deck:agent:unfocus"; agentId: string }
  | { type: "deck:agent:pause"; agentId: string }
  | { type: "deck:agent:resume"; agentId: string };

export interface DeckWorkflowStatusMsg {
  type: "deck:workflow:status";
  workflow: WorkflowState;
}

export interface DeckWorkflowNodeMsg {
  type: "deck:workflow:node";
  workflowId: string;
  node: NodeState;
}

// =====================================================
// Page / Navigation Types
// =====================================================

export type Page = "home" | "command-center" | "history" | "settings";

export type CommandCenterMode = "empty" | "planning" | "running" | "completed" | "finalizing";

// =====================================================
// Workspace Types
// =====================================================

export interface Workspace {
  id: string;
  name: string;
  path: string;
  framework: string | null;
  language: string | null;
  git_branch: string | null;
  added_at: string;
  last_used_at: string;
}

// =====================================================
// Finalize Types
// =====================================================

export interface ChangedFile {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed";
  staged: boolean;
  additions: number;
  deletions: number;
}

export interface FinalizeConfig {
  workflowId: string;
  workspacePath: string;
  selectedFiles: string[];
  commitMessage: string;
  push: boolean;
}

export interface FinalizeResult {
  commitHash: string;
  commitMessage: string;
  pushed: boolean;
  filesCommitted: number;
}
