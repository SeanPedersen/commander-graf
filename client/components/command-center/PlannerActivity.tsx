/**
 * PlannerActivity - Transient triage, exploration, and synthesis activity.
 * This deliberately renders outside the executable task graph.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useDeckStore, type StreamEvent } from "../../stores/deck-store";

type PlannerStage = "planner";

interface PlannerProgress {
  stage: PlannerStage;
  status: string;
  model?: string;
  explorerModel?: string;
}

interface PlannerPrompt {
  stage?: PlannerStage;
  model?: string;
  explorerModel?: string;
  content: string;
}

interface PlannerActivityProps {
  planId: string | null;
  task: string;
  complete?: boolean;
}

const STAGE_LABEL: Record<PlannerStage, string> = {
  planner: "Planner",
};

function progressFrom(event: StreamEvent): PlannerProgress | null {
  const planning = event.data?.planning as PlannerProgress | undefined;
  return planning?.stage ? planning : null;
}

function promptFrom(event: StreamEvent): PlannerPrompt | null {
  if (event.type !== "prompt" || !event.data?.content) return null;
  return event.data as PlannerPrompt;
}

function latestHeartbeatTokens(events: StreamEvent[]): number | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (event.type === "heartbeat") return (event.data as { estimatedTokens: number }).estimatedTokens;
    // Any visible output since the last heartbeat means the model moved on.
    if (liveContent(event) || event.type === "tool_call" || event.type === "tool_result") return null;
  }
  return null;
}

function currentStage(events: StreamEvent[], complete: boolean): string {
  if (complete) return "Task graph synthesized";
  const progress = [...events].reverse().map(progressFrom).find(Boolean);
  const stageLabel = !progress
    ? "Starting planner…"
    : progress.status === "running"
      ? "Planning task graph"
      : `${STAGE_LABEL[progress.stage]} ${progress.status}`;
  const thinkingTokens = latestHeartbeatTokens(events);
  return thinkingTokens ? `${stageLabel} — thinking… (~${thinkingTokens.toLocaleString()} tokens)` : stageLabel;
}

function liveContent(event: StreamEvent): string | null {
  if (event.type === "text" || event.type === "thinking") return event.data?.content || null;
  if (event.type === "error") return `[error] ${event.data?.message || "Unknown error"}`;
  return null;
}

function PlannerOutputEvent({ event }: { event: StreamEvent }) {
  const [expanded, setExpanded] = useState(false);

  if (event.type === "tool_call") {
    const name = event.data?.toolName || "tool call";
    const input = event.data?.toolInput;
    const detail = typeof input === "string" ? input : JSON.stringify(input, null, 2);
    return <div className="rounded border-l-2 border-deck-info/50 bg-deck-surface-2/40">
      <button onClick={() => setExpanded((value) => !value)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] text-deck-info">
        <span>{expanded ? "▼" : "▶"}</span><span>&gt; {name}</span>
      </button>
      {expanded && <pre className="max-h-56 overflow-auto border-t border-deck-border px-3 py-2 text-[11px] leading-relaxed text-deck-text-dim whitespace-pre-wrap break-words">{detail || "No tool input"}</pre>}
    </div>;
  }

  if (event.type === "tool_result") {
    const result = event.data?.content || "Tool completed";
    return <div className="rounded border-l-2 border-deck-border bg-deck-surface-2/20">
      <button onClick={() => setExpanded((value) => !value)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] text-deck-text-dim">
        <span>{expanded ? "▼" : "▶"}</span><span>result</span>
      </button>
      {expanded && <pre className="max-h-56 overflow-auto border-t border-deck-border px-3 py-2 text-[11px] leading-relaxed text-deck-text-dim whitespace-pre-wrap break-words">{result}</pre>}
    </div>;
  }

  return <pre className="text-[11px] leading-relaxed text-deck-text whitespace-pre-wrap break-words">{liveContent(event)}</pre>;
}

export function PlannerActivity({ planId, task, complete = false }: PlannerActivityProps) {
  const { outputEvents } = useDeckStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [taskExpanded, setTaskExpanded] = useState(false);
  const events = planId ? outputEvents[planId] || [] : [];
  const progress = useMemo(() => events.map(progressFrom).filter(Boolean) as PlannerProgress[], [events]);
  const prompts = useMemo(() => events.map(promptFrom).filter(Boolean) as PlannerPrompt[], [events]);
  const output = useMemo(() => events.filter((event) => liveContent(event) || event.type === "tool_call" || event.type === "tool_result"), [events]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [events.length]);

  return (
    <aside className="w-[380px] shrink-0 border-r border-deck-border bg-deck-surface flex flex-col h-full">
      <div className="shrink-0 px-4 py-3 border-b border-deck-border">
        <p className="text-sm font-medium text-deck-text-bright">Planner activity</p>
        <p className="mt-1 text-xs text-deck-text-dim">{currentStage(events, complete)}</p>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        <section>
          <p className="text-[10px] uppercase tracking-wide text-deck-muted">Build task</p>
          <div className="mt-1 relative">
            <p className={`text-xs text-deck-text whitespace-pre-wrap ${taskExpanded ? "" : "max-h-20 overflow-hidden"}`}>{task}</p>
            {task.split("\n").length > 3 || task.length > 120 ? (
              <button
                onClick={() => setTaskExpanded((v) => !v)}
                className="text-[10px] text-deck-info hover:text-deck-info/80 mt-0.5"
              >
                {taskExpanded ? "Show less" : "Show more"}
              </button>
            ) : null}
          </div>
        </section>
        <section className="space-y-2">
          <p className="text-[10px] uppercase tracking-wide text-deck-muted">Stages</p>
          {progress.length === 0 ? <p className="text-xs text-deck-text-dim animate-pulse">Connecting to planner…</p> : progress.map((entry, index) => (
            <div key={`${entry.stage}-${index}`} className="rounded border border-deck-border bg-deck-surface-2/50 px-3 py-2 text-xs">
              <div className="flex justify-between gap-2 text-deck-text">
                <span>{STAGE_LABEL[entry.stage]}</span>
                <span className="font-mono text-deck-muted">{entry.model || "configured"}</span>
              </div>
              <p className="mt-1 text-deck-text-dim">{entry.status}{entry.explorerModel ? ` · exploration: ${entry.explorerModel}` : ""}</p>
            </div>
          ))}
        </section>
        <section className="space-y-2">
          <p className="text-[10px] uppercase tracking-wide text-deck-muted">Exact prompts</p>
          {prompts.length === 0 ? <p className="text-xs text-deck-text-dim">Waiting for the first prompt…</p> : prompts.map((entry, index) => (
            <details key={`${entry.stage || "planner"}-${index}`} className="rounded border border-deck-border bg-deck-bg">
              <summary className="cursor-pointer px-3 py-2 text-xs text-deck-text">
                {entry.stage ? STAGE_LABEL[entry.stage] : "Planner"} · <span className="font-mono text-deck-muted">{entry.model || "configured"}</span>{entry.explorerModel && <span className="text-deck-muted"> · exploration: {entry.explorerModel}</span>}
              </summary>
              <pre className="max-h-64 overflow-auto border-t border-deck-border p-3 text-[11px] leading-relaxed text-deck-text-dim whitespace-pre-wrap break-words">{entry.content}</pre>
            </details>
          ))}
        </section>
        {output.length > 0 && <section className="space-y-2">
          <p className="text-[10px] uppercase tracking-wide text-deck-muted">Live output</p>
          {output.map((event, index) => <PlannerOutputEvent key={index} event={event} />)}
        </section>}
      </div>
    </aside>
  );
}
