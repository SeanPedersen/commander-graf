import type { ProjectStructure } from "../../hooks/use-project";
import type { PendingPlan } from "../../pages/CommandCenter";

interface EmptyStateProps {
  project: ProjectStructure | null;
  projectLoading: boolean;
  task: string;
  setTask: (task: string) => void;
  onPlan: () => void;
  pendingPlan: PendingPlan | null;
  onResumePlan: () => void;
  onDiscardPlan: () => void;
}

function InfoCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-deck-surface rounded-lg border border-deck-border p-3">
      <div className="text-[10px] uppercase text-deck-muted mb-1">{label}</div>
      <div className="text-sm font-mono text-deck-text-bright">{value}</div>
    </div>
  );
}

export function EmptyState({
  project,
  projectLoading,
  task,
  setTask,
  onPlan,
  pendingPlan,
  onResumePlan,
  onDiscardPlan,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-8">
      {/* Project info cards */}
      {project && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8 w-full max-w-2xl">
          <InfoCard label="Project" value={project.name} />
          <InfoCard label="Type" value={project.framework || project.type} />
          <InfoCard label="Agents" value={project.agentCount} />
          <InfoCard label="MCP Servers" value={project.mcpServerCount} />
        </div>
      )}

      {/* Existing plans (not yet launched) */}
      {pendingPlan && (
        <div className="w-full max-w-xl mb-8">
          <div className="text-[10px] uppercase text-deck-muted mb-2">
            Existing Plans
          </div>
          <div className="bg-deck-surface rounded-lg border border-deck-border p-3 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-deck-text-bright truncate">
                {pendingPlan.task}
              </p>
              <p className="text-[10px] text-deck-text-dim mt-0.5">
                {pendingPlan.plan.agents.length} agents · Est. $
                {pendingPlan.plan.estimatedCost.toFixed(2)} · ~
                {pendingPlan.plan.estimatedTimeMinutes}min
              </p>
            </div>
            <button
              onClick={onDiscardPlan}
              className="px-2.5 py-1.5 text-xs text-deck-text-dim hover:text-deck-error transition-colors"
            >
              Discard
            </button>
            <button
              onClick={onResumePlan}
              className="px-3 py-1.5 text-xs bg-deck-accent text-white rounded-lg hover:bg-deck-accent-hover transition-colors font-medium"
            >
              Resume
            </button>
          </div>
        </div>
      )}

      {projectLoading && (
        <div className="text-xs text-deck-text-dim mb-8">
          Scanning project...
        </div>
      )}

      {/* Hero text */}
      <div className="text-center mb-6">
        <svg
          className="w-10 h-10 mx-auto mb-3 text-deck-muted"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1}
            d="M13 10V3L4 14h7v7l9-11h-7z"
          />
        </svg>
        <h2 className="text-sm font-semibold text-deck-text-bright mb-1">
          What would you like to build?
        </h2>
        <p className="text-xs text-deck-text-dim">
          Describe your task. The AI architect will decompose it into a
          multi-agent plan.
        </p>
      </div>

      {/* Task input */}
      <div className="w-full max-w-xl flex gap-2">
        <input
          type="text"
          value={task}
          onChange={(e) => setTask(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && task.trim()) onPlan();
          }}
          placeholder="e.g., Add dark mode toggle to the settings page..."
          className="flex-1 px-4 py-2.5 bg-deck-surface border border-deck-border rounded-lg text-sm text-deck-text placeholder:text-deck-muted focus:outline-none focus:border-deck-accent focus:ring-1 focus:ring-deck-accent/30"
          autoFocus
        />
        <button
          onClick={onPlan}
          disabled={!task.trim()}
          className="px-5 py-2.5 bg-deck-accent text-white text-sm rounded-lg hover:bg-deck-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium"
        >
          Plan
        </button>
      </div>

      {/* Keyboard hint */}
      <p className="text-[10px] text-deck-muted mt-3">
        Press Enter to plan. Use 1-9 to select agents. Cmd+1/2/3 to switch
        pages.
      </p>
    </div>
  );
}
