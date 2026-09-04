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
    <div className="flex flex-col h-full px-8 py-6">
      {/* Project info cards - prominent at top */}
      {project && (
        <div className="flex gap-3 mb-6 w-full max-w-4xl mx-auto">
          <InfoCard label="Project" value={project.name} />
          <InfoCard label="Dir" value={project.root.split("/").pop() || project.root} />
          <InfoCard label="Type" value={project.framework || project.type} />
          <InfoCard label="Agents" value={project.agentCount} />
          <InfoCard label="MCP Servers" value={project.mcpServerCount} />
        </div>
      )}

      {/* Existing plans (not yet launched) */}
      {pendingPlan && (
        <div className="w-full max-w-xl mb-6 mx-auto">
          <div className="text-[10px] uppercase text-deck-muted mb-2">
            Existing Plans
          </div>
          <div className="bg-deck-surface rounded-lg border border-deck-border p-3 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-deck-text-bright truncate">
                {pendingPlan.task}
              </p>
              <p className="text-[10px] text-deck-text-dim mt-0.5">
                {"tasks" in pendingPlan.plan
                  ? pendingPlan.plan.tasks.length
                  : pendingPlan.plan.agents.length} {"tasks" in pendingPlan.plan ? "tasks" : "legacy agents"}
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
        <div className="text-xs text-deck-text-dim mb-6">
          Scanning project...
        </div>
      )}

      {/* Hero text */}
      <div className="text-center mb-4">
        <h2 className="text-sm font-semibold text-deck-text-bright mb-1">
          What would you like to build?
        </h2>
        <p className="text-xs text-deck-text-dim">
          Describe your task. The AI architect will decompose it into a
          multi-agent plan.
        </p>
      </div>

      {/* Task input - large textarea */}
      <div className="w-full max-w-4xl mx-auto flex flex-col gap-3 flex-1">
        <textarea
          value={task}
          onChange={(e) => setTask(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && task.trim()) onPlan();
          }}
          placeholder={"Describe what you want to build...\n\nExample:\n- Add a dark mode toggle to the settings page\n- When toggled, persist preference in localStorage\n- Update all components to respect the theme"}
          className="flex-1 min-h-[180px] w-full px-4 py-3 bg-deck-surface border border-deck-border rounded-lg text-sm text-deck-text placeholder:text-deck-muted focus:outline-none focus:border-deck-accent focus:ring-1 focus:ring-deck-accent/30 resize-none font-mono leading-relaxed"
          autoFocus
        />
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-deck-muted">
            Cmd+Enter to plan
          </p>
          <button
            onClick={onPlan}
            disabled={!task.trim()}
            className="px-5 py-2.5 bg-deck-accent text-white text-sm rounded-lg hover:bg-deck-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium"
          >
            Plan
          </button>
        </div>
      </div>
    </div>
  );
}
