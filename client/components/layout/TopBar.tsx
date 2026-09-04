import { useMemo } from "react";
import { useDeckStore } from "../../stores/deck-store";
import type { WorkspaceInfo, Page } from "../../stores/deck-store";
import { StatusDot } from "../shared/StatusDot";
import type { ProjectStructure } from "../../hooks/use-project";

const PAGE_TITLES: Record<Page, string> = {
  home: "Commander Graf",
  "command-center": "Command Center",
  history: "History",
  settings: "Settings",
};

interface TopBarProps {
  project: ProjectStructure | null;
  activeWorkspace?: WorkspaceInfo | null;
}

export function TopBar({ project, activeWorkspace }: TopBarProps) {
  const { mode, agents, activeWorkflow, page, goHome, theme, toggleTheme } = useDeckStore();

  const activeCount = agents.filter(
    (a) => a.status === "running" || a.status === "idle"
  ).length;

  const totalCost = agents.reduce((sum, a) => sum + a.total_cost_usd, 0);

  const modeLabel = useMemo(() => {
    switch (mode) {
      case "empty":
        return null;
      case "planning":
        return (
          <div className="flex items-center gap-2 text-deck-warning">
            <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-xs font-medium">Planning...</span>
          </div>
        );
      case "reviewing":
        return (
          <div className="flex items-center gap-2 text-deck-accent">
            <StatusDot status="pending" />
            <span className="text-xs font-medium">Ready to launch</span>
          </div>
        );
      case "running":
        return (
          <div className="flex items-center gap-2">
            <StatusDot status="running" />
            <span className="text-xs font-medium text-deck-success">Running</span>
            {activeWorkflow && activeWorkflow.totalCost > 0 && (
              <span className="text-[10px] font-mono text-deck-text-dim">
                ${activeWorkflow.totalCost.toFixed(3)}
              </span>
            )}
          </div>
        );
      case "completed":
        return (
          <div className="flex items-center gap-2">
            <StatusDot status={activeWorkflow?.status === "failed" ? "failed" : "completed"} />
            <span className={`text-xs font-medium ${
              activeWorkflow?.status === "failed" ? "text-deck-error" : "text-deck-accent"
            }`}>
              {activeWorkflow?.status === "failed" ? "Failed" : "Completed"}
            </span>
          </div>
        );
      case "finalizing":
        return (
          <div className="flex items-center gap-2 text-deck-warning">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-xs font-medium">Finalizing...</span>
          </div>
        );
      default:
        return null;
    }
  }, [mode, activeWorkflow]);

  const isElectron = !!(window as any).commanderGraf?.isElectron;

  return (
    <div className={`shrink-0 h-10 border-b border-deck-border bg-deck-surface flex items-center justify-between ${isElectron ? "pl-20 pr-4" : "px-4"}`} style={isElectron ? { WebkitAppRegion: "drag" } as any : undefined}>
      {/* Left: project info */}
      <div className="flex items-center gap-3 min-w-0" style={{ WebkitAppRegion: "no-drag" } as any}>
        {page === "command-center" && activeWorkspace && (
          <button
            onClick={goHome}
            className="text-deck-text-dim hover:text-deck-text transition-colors shrink-0"
            title="Back to Home"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}
        <span className="text-xs font-semibold text-deck-text-bright truncate">
          {page === "command-center" && activeWorkspace ? activeWorkspace.name : PAGE_TITLES[page]}
        </span>
        {page === "command-center" && (activeWorkspace?.git_branch || project?.gitBranch) && (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-deck-surface-2 text-deck-text-dim truncate">
            {activeWorkspace?.git_branch || project?.gitBranch}
          </span>
        )}
      </div>

      {/* Center: mode status */}
      <div className="absolute left-1/2 -translate-x-1/2">{modeLabel}</div>

      {/* Right: cost + agent count + theme toggle */}
      <div className="flex items-center gap-3 shrink-0" style={{ WebkitAppRegion: "no-drag" } as any}>
        {page === "command-center" && activeWorkspace && (
          <div className="flex items-center gap-3 text-xs text-deck-text-dim">
            <span className="font-mono text-deck-success">
              ${totalCost.toFixed(2)}
            </span>
            <span>
              {activeCount}/{agents.length} agents
            </span>
          </div>
        )}
        <button
          onClick={toggleTheme}
          className="text-deck-text-dim hover:text-deck-text-bright hover:bg-deck-surface-2 focus:outline-none focus:ring-1 focus:ring-deck-accent rounded p-1 transition-colors"
          aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
        >
          {theme === "dark" ? (
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
