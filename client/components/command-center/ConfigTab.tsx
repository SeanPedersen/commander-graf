/**
 * ConfigTab - Agent configuration: model, runtime, prompt, workspace.
 * For editing before launch or viewing during/after execution.
 */

import type { Agent, NodeState } from "../../stores/deck-store";
import type { PlannedAgent } from "./PlanningCanvas";
import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getModelOptions, type RuntimeType } from "../../models";

const API_BASE = "/api/deck";

interface RoutingSettings {
  defaultRuntime: RuntimeType;
  lowComplexityModel: string;
  mediumComplexityModel: string;
  highComplexityModel: string;
}

const DEFAULT_ROUTING: RoutingSettings = {
  defaultRuntime: "claude-code",
  lowComplexityModel: "haiku",
  mediumComplexityModel: "sonnet",
  highComplexityModel: "opus",
};

function matchedModel(complexity: PlannedAgent["complexity"], settings: RoutingSettings): string {
  if (complexity === "low") return settings.lowComplexityModel;
  if (complexity === "high") return settings.highComplexityModel;
  return settings.mediumComplexityModel;
}

function criteriaText(criteria: string[]): string {
  return criteria.join("\n");
}

function parseCriteria(value: string): string[] {
  return value.split("\n").map((criterion) => criterion.trim()).filter(Boolean);
}

interface TextEditorOverlayProps {
  title: string;
  initialValue: string;
  helpText?: string;
  onSave: (value: string) => void;
  onClose: () => void;
}

function TextEditorOverlay({ title, initialValue, helpText, onSave, onClose }: TextEditorOverlayProps) {
  const [value, setValue] = useState(initialValue);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6" role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex h-[min(760px,calc(100vh-3rem))] w-[min(900px,100%)] flex-col rounded-xl border border-deck-border bg-deck-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-deck-border px-5 py-3">
          <div><h2 className="text-sm font-medium text-deck-text-bright">{title}</h2>{helpText && <p className="mt-0.5 text-xs text-deck-muted">{helpText}</p>}</div>
          <button onClick={onClose} className="text-deck-muted hover:text-deck-text" aria-label="Close editor">×</button>
        </div>
        <textarea autoFocus value={value} onChange={(event) => setValue(event.target.value)} className="m-5 min-h-0 flex-1 resize-none rounded border border-deck-border bg-deck-bg p-4 font-mono text-sm leading-relaxed text-deck-text focus:border-deck-accent focus:outline-none" />
        <div className="flex justify-end gap-2 border-t border-deck-border px-5 py-3">
          <button onClick={onClose} className="rounded-lg border border-deck-border px-3 py-2 text-xs text-deck-text-dim hover:bg-deck-surface-2">Cancel</button>
          <button onClick={() => onSave(value)} className="rounded-lg bg-deck-accent px-4 py-2 text-xs font-medium text-white hover:bg-deck-accent-hover">Save changes</button>
        </div>
      </div>
    </div>
  );
}

interface ConfigTabProps {
  agent?: Agent | null;
  workflowNode?: NodeState | null;
  plannedAgent?: PlannedAgent | null;
  onUpdatePlannedAgent?: (patch: Partial<PlannedAgent>) => void;
}

export function ConfigTab({
  agent,
  workflowNode,
  plannedAgent,
  onUpdatePlannedAgent,
}: ConfigTabProps) {
  const config = workflowNode?.config || {};
  const [editing, setEditing] = useState<"prompt" | "criteria" | null>(null);
  const [routing, setRouting] = useState<RoutingSettings>(DEFAULT_ROUTING);
  const prompt = agent?.prompt || config.prompt || config.task || plannedAgent?.prompt || "";
  const workdir = config.workdir || plannedAgent?.workdir || ".";
  const routedModel = plannedAgent ? matchedModel(plannedAgent.complexity, routing) : "";
  const model = agent?.model || config.model || plannedAgent?.model || routedModel;
  const modelOptions = useMemo(() => getModelOptions(routing.defaultRuntime), [routing.defaultRuntime]);
  const availableModels = useMemo(
    () => modelOptions.some((option) => option.value === model)
      ? modelOptions
      : [{ value: model, label: model }, ...modelOptions],
    [model, modelOptions]
  );

  // Pre-launch: no live agent/workflow node yet, so the plan is still editable.
  const editable = !agent && !workflowNode && !!plannedAgent && !!onUpdatePlannedAgent;

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/settings`)
      .then((response) => (response.ok ? response.json() : null))
      .then((settings) => {
        if (cancelled || !settings) return;
        setRouting({
          defaultRuntime: settings.defaultRuntime || DEFAULT_ROUTING.defaultRuntime,
          lowComplexityModel: settings.lowComplexityModel || DEFAULT_ROUTING.lowComplexityModel,
          mediumComplexityModel: settings.mediumComplexityModel || DEFAULT_ROUTING.mediumComplexityModel,
          highComplexityModel: settings.highComplexityModel || DEFAULT_ROUTING.highComplexityModel,
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      {plannedAgent && <div className="grid grid-cols-2 gap-3 text-xs"><div><span className="text-deck-muted">Complexity</span><p className="text-deck-text">{plannedAgent.complexity}</p></div><div><span className="text-deck-muted">Depends on</span><p className="text-deck-text">{plannedAgent.dependsOn.join(", ") || "None"}</p></div></div>}

      {plannedAgent && <div>
        <label className="text-[10px] uppercase text-deck-muted block mb-1">Model</label>
        <div className="flex gap-2">
          <select value={model} disabled={!editable} onChange={(event) => onUpdatePlannedAgent?.({ model: event.target.value })} className="flex-1 text-xs font-mono px-3 py-2 bg-deck-surface-2 border border-deck-border rounded text-deck-text focus:outline-none disabled:opacity-100">
            {availableModels.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          {editable && plannedAgent.model && <button onClick={() => onUpdatePlannedAgent?.({ model: undefined })} className="px-2 text-xs text-deck-muted hover:text-deck-text">Reset</button>}
        </div>
        <p className="mt-1 text-[10px] text-deck-muted">{plannedAgent.model ? "Task override" : `Matched from ${plannedAgent.complexity} complexity`} · routed: {routedModel}</p>
      </div>}

      {/* Workspace */}
      <div>
        <label className="text-[10px] uppercase text-deck-muted block mb-1">
          Workspace
        </label>
        <input
          type="text"
          value={workdir}
          disabled
          className="w-full text-xs font-mono px-3 py-2 bg-deck-surface-2 border border-deck-border rounded text-deck-text-dim"
        />
      </div>

      {/* Prompt */}
      <div>
        <label className="text-[10px] uppercase text-deck-muted block mb-1">
          Task prompt (Markdown)
        </label>
        {editable && <button onClick={() => setEditing("prompt")} className="mb-2 text-xs text-deck-accent hover:text-deck-accent-hover">Edit in overlay</button>}
        <div className="prose prose-invert prose-sm max-w-none text-xs p-3 bg-deck-surface-2 border border-deck-border rounded"><ReactMarkdown remarkPlugins={[remarkGfm]}>{prompt}</ReactMarkdown></div>
      </div>

      {plannedAgent && <div>
        <label className="text-[10px] uppercase text-deck-muted block mb-1">Acceptance criteria</label>
        {editable && <button onClick={() => setEditing("criteria")} className="mb-2 text-xs text-deck-accent hover:text-deck-accent-hover">Edit in overlay</button>}
        <ul className="text-xs list-disc pl-4 space-y-1">{plannedAgent.acceptanceCriteria.map((criterion, index) => <li key={`${criterion}-${index}`}>{criterion}</li>)}</ul>
      </div>}

      {/* Agent meta */}
      {agent && (
        <div className="space-y-2 pt-2 border-t border-deck-border">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-deck-muted">Agent ID</span>
            <span className="font-mono text-deck-text-dim truncate max-w-[200px]">
              {agent.id}
            </span>
          </div>
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-deck-muted">Status</span>
            <span className="text-deck-text">{agent.status}</span>
          </div>
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-deck-muted">Cost</span>
            <span className="font-mono text-deck-success">
              ${agent.total_cost_usd < 0.01 ? agent.total_cost_usd.toFixed(4) : agent.total_cost_usd.toFixed(2)}
            </span>
          </div>
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-deck-muted">Tokens</span>
            <span className="font-mono text-deck-text-dim">
              {(agent.total_input_tokens / 1000).toFixed(1)}K in /{" "}
              {(agent.total_output_tokens / 1000).toFixed(1)}K out
            </span>
          </div>
          {agent.session_id && (
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-deck-muted">Session</span>
              <span className="font-mono text-deck-text-dim truncate max-w-[200px]">
                {agent.session_id}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Workflow node meta */}
      {workflowNode && !agent && (
        <div className="space-y-2 pt-2 border-t border-deck-border">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-deck-muted">Node</span>
            <span className="text-deck-text">{workflowNode.agentName}</span>
          </div>
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-deck-muted">Status</span>
            <span className="text-deck-text">{workflowNode.status}</span>
          </div>
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-deck-muted">Cost</span>
            <span className="font-mono text-deck-success">
              ${workflowNode.cost.toFixed(4)}
            </span>
          </div>
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-deck-muted">Retries</span>
            <span className="text-deck-text">{workflowNode.retryCount}</span>
          </div>
          {workflowNode.error && (
            <div>
              <span className="text-[10px] text-deck-muted">Error</span>
              <p className="text-xs text-deck-error mt-0.5 break-words">
                {workflowNode.error}
              </p>
            </div>
          )}
        </div>
      )}

      {editing === "prompt" && <TextEditorOverlay key="prompt" title="Edit task prompt" initialValue={prompt} helpText="Markdown is supported." onClose={() => setEditing(null)} onSave={(value) => { onUpdatePlannedAgent?.({ prompt: value }); setEditing(null); }} />}
      {editing === "criteria" && plannedAgent && <TextEditorOverlay key="criteria" title="Edit acceptance criteria" initialValue={criteriaText(plannedAgent.acceptanceCriteria)} helpText="Use one criterion per line." onClose={() => setEditing(null)} onSave={(value) => { onUpdatePlannedAgent?.({ acceptanceCriteria: parseCriteria(value) }); setEditing(null); }} />}
    </div>
  );
}
