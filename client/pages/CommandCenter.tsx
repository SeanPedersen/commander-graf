/**
 * CommandCenter - The main page with four modes:
 *   empty     -> Project info + task input
 *   planning  -> Spinner while AI architect plans
 *   running   -> React Flow DAG + right panel + output drawer
 *   completed -> Summary with cost/time + new mission option
 */

import { useState, useRef, useEffect, useMemo } from "react";
import { useDeckStore } from "../stores/deck-store";
import type { ProjectStructure } from "../hooks/use-project";
import { EmptyState } from "../components/command-center/EmptyState";
import {
  PlanningCanvas,
  type MissionPlan,
  type PlannedAgent,
} from "../components/command-center/PlanningCanvas";
import { RunningCanvas } from "../components/command-center/RunningCanvas";
import { RightPanel } from "../components/command-center/RightPanel";
import { OutputDrawer } from "../components/command-center/OutputDrawer";
import { CompletedSummary } from "../components/command-center/CompletedSummary";
import { FinalizePanel } from "../components/command-center/FinalizePanel";

const API_BASE = "/api/deck";

// Stand-in node id/name shown as a single running node on the DAG canvas
// while the architect is still investigating and drafting the real plan.
const ARCHITECT_NODE = "architect";

export interface PendingPlan {
  planId: string;
  plan: MissionPlan;
  task: string;
}

interface CommandCenterProps {
  sendJsonMessage: (msg: any) => void;
  project: ProjectStructure | null;
  projectLoading: boolean;
  rescanProject: (path?: string) => void;
}

export function CommandCenter({
  sendJsonMessage,
  project,
  projectLoading,
  rescanProject,
}: CommandCenterProps) {
  const {
    mode,
    setMode,
    selectedAgentId,
    setSelectedAgentId,
    setActiveWorkflow,
    clearOutputEvents,
    addToast,
    activeWorkspaceId,
    outputEvents,
  } = useDeckStore();

  const [task, setTask] = useState("");
  const [plan, setPlan] = useState<MissionPlan | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [pendingPlan, setPendingPlan] = useState<PendingPlan | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // The server emits the architect's actual full prompt as the first live
  // event (see server/deck/architect.ts) — until it arrives, fall back to a
  // short placeholder so the node/Config tab always show something sensible.
  const architectPromptText = useMemo(() => {
    const events = planId ? outputEvents[planId] : undefined;
    const promptEvent = events?.find((e) => e.type === "prompt");
    if (promptEvent?.data?.content) return promptEvent.data.content as string;
    return task
      ? `Investigating the codebase to plan: "${task}"`
      : "Investigating the codebase…";
  }, [outputEvents, planId, task]);

  // Single-node placeholder DAG shown while the architect is running — once
  // the real plan lands we swap straight to the full multi-agent graph, with
  // this node kept around (marked done) as the graph's root.
  const architectPlan: MissionPlan = useMemo(
    () => ({
      agents: [
        {
          name: ARCHITECT_NODE,
          task: architectPromptText,
          role: "architect",
          workdir: ".",
          model: "sonnet",
          runtime: "claude-code",
          dependsOn: [],
        },
      ],
      estimatedCost: 0,
      estimatedTimeMinutes: 0,
    }),
    [architectPromptText]
  );

  // ─── Look up a saved (not-yet-launched) plan on load / workspace switch ──
  // Surfaced in the project view (EmptyState) so it isn't silently lost or
  // silently auto-resumed — the user picks whether to continue or discard it.

  useEffect(() => {
    setPendingPlan(null);
    if (!activeWorkspaceId) return;
    let cancelled = false;

    fetch(`${API_BASE}/mission/plan/pending?workspaceId=${activeWorkspaceId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data?.plan) return;
        setPendingPlan({ planId: data.planId, plan: data.plan, task: data.task || "" });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [activeWorkspaceId]);

  // ─── Actions ──────────────────────────────────────

  function handleResumePlan() {
    if (!pendingPlan) return;
    setPlan(pendingPlan.plan);
    setPlanId(pendingPlan.planId);
    setTask(pendingPlan.task);
    setPendingPlan(null);
    setMode("reviewing");
  }

  async function handleDiscardPlan() {
    if (!pendingPlan) return;
    const id = pendingPlan.planId;
    setPendingPlan(null);
    try {
      await fetch(`${API_BASE}/mission/plan/${id}`, { method: "DELETE" });
    } catch {
      // ignore
    }
  }

  async function handlePlan() {
    if (!task.trim()) return;
    setPlan(null);
    setPendingPlan(null);
    setActiveWorkflow(null);
    clearOutputEvents();
    setMode("planning");

    // Generate the plan id up front so we can subscribe to the architect's
    // live output (over the existing agent-focus WS channel) before the
    // planning request even reaches the server.
    const newPlanId = crypto.randomUUID();
    setPlanId(newPlanId);
    sendJsonMessage({ type: "deck:agent:focus", agentId: newPlanId });
    // Auto-select the stand-in architect node so its live output is visible
    // immediately, same as clicking any other running node would show.
    setSelectedAgentId(ARCHITECT_NODE);

    try {
      const res = await fetch(`${API_BASE}/mission/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task,
          path: project?.root || ".",
          workspaceId: activeWorkspaceId || undefined,
          planId: newPlanId,
        }),
      });
      if (!res.ok) {
        const errBody = await res
          .json()
          .catch(() => ({ error: "Unknown error" }));
        throw new Error(errBody.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setPlan(data.plan);
      setPlanId(data.planId || newPlanId);
      setSelectedAgentId(null);
      setMode("reviewing");
    } catch (err: any) {
      addToast(`Planning failed: ${err.message}`);
      setSelectedAgentId(null);
      setMode("empty");
    } finally {
      sendJsonMessage({ type: "deck:agent:unfocus", agentId: newPlanId });
    }
  }

  async function handleLaunch() {
    if (!plan) return;

    try {
      sendJsonMessage({ type: "deck:subscribe" });

      const res = await fetch(`${API_BASE}/workflow/launch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan,
          name: task.slice(0, 50),
          projectRoot: project?.root || ".",
          workspaceId: activeWorkspaceId || undefined,
          planId: planId || undefined,
        }),
      });
      if (!res.ok) {
        const errBody = await res
          .json()
          .catch(() => ({ error: "Unknown error" }));
        throw new Error(errBody.error || `HTTP ${res.status}`);
      }
      const wf = await res.json();
      setActiveWorkflow(wf);
      setPlanId(null);
      setMode("running");

      // Focus all agents for output streaming
      for (const node of Object.values(wf.nodes) as any[]) {
        if (node.agentId) {
          sendJsonMessage({ type: "deck:agent:focus", agentId: node.agentId });
        }
      }
    } catch (err: any) {
      addToast(`Launch failed: ${err.message}`);
    }
  }

  async function handleAbort() {
    const wf = useDeckStore.getState().activeWorkflow;
    if (!wf) return;
    try {
      await fetch(`${API_BASE}/workflow/${wf.id}/abort`, { method: "POST" });
    } catch {
      // ignore
    }
  }

  function handleReset() {
    if (planId) {
      fetch(`${API_BASE}/mission/plan/${planId}`, { method: "DELETE" }).catch(() => {});
    }
    setPlan(null);
    setPlanId(null);
    setActiveWorkflow(null);
    clearOutputEvents();
    setMode("empty");
    setTask("");
    setSelectedAgentId(null);
    inputRef.current?.focus();
  }

  function handleSelectNode(name: string) {
    setSelectedAgentId(name);
  }

  function handleUpdatePlannedAgent(patch: Partial<PlannedAgent>) {
    setPlan((prev) => {
      if (!prev || !selectedAgentId) return prev;
      return {
        ...prev,
        agents: prev.agents.map((a) =>
          a.name === selectedAgentId ? { ...a, ...patch } : a
        ),
      };
    });
  }

  // ─── Render ───────────────────────────────────────

  // Reviewing mode: plan is ready, show PlanningCanvas for review before launch.
  // The architect stays visible as a finished node feeding the real plan's
  // root agents, instead of disappearing once it's done.
  if (mode === "reviewing" && plan) {
    const architectSelected = selectedAgentId === ARCHITECT_NODE;
    return (
      <div className="flex h-full">
        <div className="flex-1 flex flex-col overflow-hidden">
          <PlanningCanvas
            plan={plan}
            extraNode={{ agent: architectPlan.agents[0], status: "success" }}
            onLaunch={handleLaunch}
            onReplan={handlePlan}
            onSelectNode={handleSelectNode}
          />
        </div>
        {selectedAgentId && (
          <RightPanel
            sendJsonMessage={sendJsonMessage}
            plannedAgent={
              architectSelected
                ? architectPlan.agents[0]
                : plan.agents.find((a) => a.name === selectedAgentId) || null
            }
            onUpdatePlannedAgent={
              architectSelected ? undefined : handleUpdatePlannedAgent
            }
            liveAgentId={architectSelected ? planId : undefined}
            liveAgentStatus={architectSelected ? "success" : undefined}
          />
        )}
      </div>
    );
  }

  // Planning mode: same DAG canvas as reviewing, but with a single running
  // "architect" node — clicking it shows its live output. Once the real plan
  // lands, this swaps straight to the full multi-agent graph (mode flips to
  // "reviewing"), so the two screens read as one continuous view.
  if (mode === "planning") {
    return (
      <div className="flex h-full">
        <div className="flex-1 flex flex-col overflow-hidden">
          <PlanningCanvas
            plan={architectPlan}
            isPlanning
            onLaunch={() => {}}
            onReplan={() => {}}
            onSelectNode={handleSelectNode}
          />
        </div>
        {selectedAgentId && (
          <RightPanel
            sendJsonMessage={sendJsonMessage}
            plannedAgent={architectPlan.agents[0]}
            liveAgentId={planId}
          />
        )}
      </div>
    );
  }

  // Running mode
  if (mode === "running") {
    return (
      <div className="flex flex-col h-full">
        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 flex flex-col overflow-hidden">
            <RunningCanvas
              onSelectNode={handleSelectNode}
              onAbort={handleAbort}
            />
          </div>
          {selectedAgentId && <RightPanel sendJsonMessage={sendJsonMessage} />}
        </div>
        <OutputDrawer />
      </div>
    );
  }

  // Finalizing mode
  if (mode === "finalizing") {
    return (
      <div className="flex h-full">
        <div className="flex-1">
          <CompletedSummary onNewMission={handleReset} />
        </div>
        <FinalizePanel />
      </div>
    );
  }

  // Completed mode
  if (mode === "completed") {
    return <CompletedSummary onNewMission={handleReset} />;
  }

  // Empty mode — if no workspace selected, nudge user to pick one
  if (!activeWorkspaceId) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <svg className="w-10 h-10 text-deck-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
        <p className="text-sm text-deck-text-dim">Select a project to get started</p>
        <button
          onClick={() => useDeckStore.getState().goHome()}
          className="px-4 py-2 text-xs font-medium bg-deck-accent text-white rounded-lg hover:bg-deck-accent-hover transition-colors"
        >
          Go to Projects
        </button>
      </div>
    );
  }

  // Empty mode (default)
  return (
    <EmptyState
      project={project}
      projectLoading={projectLoading}
      task={task}
      setTask={setTask}
      onPlan={handlePlan}
      pendingPlan={pendingPlan}
      onResumePlan={handleResumePlan}
      onDiscardPlan={handleDiscardPlan}
    />
  );
}
