import { create } from "zustand";

// ─── Types ─────────────────────────────────────────

export type Page = "home" | "command-center" | "history" | "settings";
export type Theme = "dark" | "light";
export type CommandCenterMode = "empty" | "planning" | "reviewing" | "running" | "completed" | "finalizing" | "error";
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
export type RuntimeType = "claude-code" | "codex" | "gemini-cli" | "litellm";

export interface Agent {
  id: string;
  name: string;
  agent_type: string;
  status: AgentStatus;
  model: string;
  prompt: string;
  started_at: string;
  last_event_at: string | null;
  total_cost_usd: number;
  total_input_tokens: number;
  total_output_tokens: number;
  visible: boolean;
  interactive?: boolean;
  session_id?: string | null;
  runtime?: RuntimeType;
}

export interface WorkflowState {
  id: string;
  name: string;
  status: string;
  nodes: Record<string, NodeState>;
  edges: Array<{ source: string; target: string; condition: string }>;
  totalCost: number;
  maxBudgetUsd: number;
  startedAt: number | null;
  completedAt: number | null;
}

export interface NodeState {
  agentName: string;
  config: any;
  status: string;
  cost: number;
  retryCount: number;
  agentId: string | null;
  error: string | null;
}

export interface ContextUsage {
  usedTokens: number;
  maxTokens: number;
  percentage: number;
}

export interface StreamEvent {
  type: string;
  agentId: string;
  timestamp: string;
  data: any;
}

export interface WorkspaceInfo {
  id: string;
  name: string;
  path: string;
  framework: string | null;
  language: string | null;
  git_branch: string | null;
  added_at: string;
  last_used_at: string;
}

export interface ChangedFile {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed";
  staged: boolean;
  additions: number;
  deletions: number;
}

export interface FinalizeState {
  files: ChangedFile[];
  selectedFiles: Set<string>;
  commitMessage: string;
  generating: boolean;
  executing: boolean;
  diff: string | null;
  diffFile: string | null;
}

// ─── Store ─────────────────────────────────────────

interface DeckStore {
  // Navigation
  page: Page;
  setPage: (page: Page) => void;

  // Workspaces
  workspaces: WorkspaceInfo[];
  setWorkspaces: (ws: WorkspaceInfo[]) => void;
  activeWorkspaceId: string | null;
  setActiveWorkspaceId: (id: string | null) => void;

  // Command Center
  mode: CommandCenterMode;
  setMode: (mode: CommandCenterMode) => void;

  // Agents
  agents: Agent[];
  setAgents: (agents: Agent[]) => void;
  updateAgent: (agent: Agent) => void;
  selectedAgentId: string | null;
  setSelectedAgentId: (id: string | null) => void;

  // Workflow
  activeWorkflow: WorkflowState | null;
  setActiveWorkflow: (wf: WorkflowState | null) => void;
  updateWorkflowNode: (workflowId: string, node: NodeState) => void;

  // Output
  outputEvents: Record<string, StreamEvent[]>;
  pushOutputEvent: (agentId: string, event: StreamEvent) => void;
  clearOutputEvents: () => void;

  // Context usage
  contextUsage: Record<string, ContextUsage>;
  setContextUsage: (agentId: string, usage: ContextUsage) => void;

  // Sidebar
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  // Connected
  isConnected: boolean;
  setConnected: (connected: boolean) => void;

  // Finalize
  finalizeState: FinalizeState | null;
  setFinalizeState: (state: FinalizeState | null) => void;
  updateFinalizeState: (partial: Partial<FinalizeState>) => void;

  // Navigation helpers
  goHome: () => void;

  // Toasts
  toasts: string[];
  addToast: (msg: string) => void;
  removeToast: () => void;

  // Theme
  theme: Theme;
  toggleTheme: () => void;
}

const THEME_STORAGE_KEY = "commander-graf-theme";
const LIGHT_QUERY = "(prefers-color-scheme: light)";

/** Only an explicit user choice is stored; anything else means "follow the OS". */
function readStoredTheme(): Theme | null {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    return raw === "dark" || raw === "light" ? raw : null;
  } catch {
    return null; // storage blocked (private mode / cookies disabled)
  }
}

function osTheme(): Theme {
  return window.matchMedia?.(LIGHT_QUERY).matches ? "light" : "dark";
}

/** Mirrors the pre-paint bootstrap in client/index.html — keep the two in sync. */
function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

function persistTheme(theme: Theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Non-fatal: the theme still applies for the rest of this session.
  }
}

const initialTheme: Theme = readStoredTheme() ?? osTheme();
applyTheme(initialTheme);

export const useDeckStore = create<DeckStore>((set) => ({
  // Navigation
  page: "home",
  setPage: (page) => set({ page }),

  // Workspaces
  workspaces: [],
  setWorkspaces: (workspaces) => set({ workspaces }),
  activeWorkspaceId: null,
  setActiveWorkspaceId: (id) => set({ activeWorkspaceId: id }),

  // Command Center
  mode: "empty",
  setMode: (mode) => set({ mode }),

  // Agents
  agents: [],
  setAgents: (agents) => set({ agents }),
  updateAgent: (agent) =>
    set((state) => {
      const idx = state.agents.findIndex((a) => a.id === agent.id);
      if (idx >= 0) {
        const next = [...state.agents];
        next[idx] = agent;
        return { agents: next };
      }
      return { agents: [agent, ...state.agents] };
    }),
  selectedAgentId: null,
  setSelectedAgentId: (id) => set({ selectedAgentId: id }),

  // Workflow
  activeWorkflow: null,
  setActiveWorkflow: (wf) => set({ activeWorkflow: wf }),
  updateWorkflowNode: (workflowId, node) =>
    set((state) => {
      if (!state.activeWorkflow || state.activeWorkflow.id !== workflowId) {
        return state;
      }
      return {
        activeWorkflow: {
          ...state.activeWorkflow,
          nodes: {
            ...state.activeWorkflow.nodes,
            [node.agentName]: node,
          },
        },
      };
    }),

  // Output
  outputEvents: {},
  pushOutputEvent: (agentId, event) =>
    set((state) => ({
      outputEvents: {
        ...state.outputEvents,
        [agentId]: [...(state.outputEvents[agentId] || []), event],
      },
    })),
  clearOutputEvents: () => set({ outputEvents: {} }),

  // Context usage
  contextUsage: {},
  setContextUsage: (agentId, usage) =>
    set((state) => ({
      contextUsage: { ...state.contextUsage, [agentId]: usage },
    })),

  // Sidebar
  sidebarCollapsed: true,
  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

  // Connected
  isConnected: false,
  setConnected: (connected) => set({ isConnected: connected }),

  // Finalize
  finalizeState: null,
  setFinalizeState: (state) => set({ finalizeState: state }),
  updateFinalizeState: (partial) =>
    set((state) => ({
      finalizeState: state.finalizeState
        ? { ...state.finalizeState, ...partial }
        : null,
    })),

  // Navigation helpers
  goHome: () =>
    set({
      activeWorkspaceId: null,
      mode: "empty",
      activeWorkflow: null,
      outputEvents: {},
      finalizeState: null,
      page: "home",
    }),

  // Toasts
  toasts: [],
  addToast: (msg) => set((state) => ({ toasts: [...state.toasts, msg] })),
  removeToast: () => set((state) => ({ toasts: state.toasts.slice(0, -1) })),

  // Theme
  theme: initialTheme,
  toggleTheme: () =>
    set((state) => {
      const theme: Theme = state.theme === "dark" ? "light" : "dark";
      applyTheme(theme);
      persistTheme(theme);
      return { theme };
    }),
}));

// Track the OS preference until the user makes an explicit choice.
window.matchMedia?.(LIGHT_QUERY).addEventListener("change", (e) => {
  if (readStoredTheme()) return;
  const theme: Theme = e.matches ? "light" : "dark";
  applyTheme(theme);
  useDeckStore.setState({ theme });
});
