/**
 * OutputTab - Full output for the selected agent.
 * Shows text content and tool calls in a structured view.
 */

import { useState } from "react";
import { useDeckStore } from "../../stores/deck-store";
import type { StreamEvent } from "../../stores/deck-store";

interface OutputTabProps {
  agentId: string | null;
}

export function OutputTab({ agentId }: OutputTabProps) {
  const { outputEvents } = useDeckStore();
  const events = agentId ? outputEvents[agentId] || [] : [];

  if (!agentId) {
    return (
      <div className="flex items-center justify-center h-full text-deck-muted text-xs">
        No agent selected
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-deck-muted text-xs">
        No output yet
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-3 space-y-1">
      {events.map((evt, i) => (
        <OutputEventBlock key={i} event={evt} />
      ))}
    </div>
  );
}

function OutputEventBlock({ event }: { event: StreamEvent }) {
  const [expanded, setExpanded] = useState(false);

  switch (event.type) {
    case "text":
      return (
        <pre className="text-xs text-deck-text whitespace-pre-wrap break-words font-mono leading-relaxed">
          {event.data?.content || ""}
        </pre>
      );

    case "thinking":
      return (
        <div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-[10px] text-deck-thinking hover:text-deck-thinking/80"
          >
            <span>{expanded ? "\u25BC" : "\u25B6"}</span>
            <span className="italic">thinking</span>
          </button>
          {expanded && (
            <pre className="text-xs text-deck-thinking/70 italic whitespace-pre-wrap break-words font-mono pl-3 border-l border-deck-thinking/30 mt-0.5">
              {event.data?.content || ""}
            </pre>
          )}
        </div>
      );

    case "tool_call": {
      const toolName =
        event.data?.toolName
          ?.replace(/^mcp__[^_]+__/, "")
          .replace(/_/g, " ") || "unknown";
      return (
        <div className="bg-deck-surface-2/50 border-l-2 border-deck-info/40 px-3 py-1.5 rounded-r">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1.5 w-full text-left"
          >
            <span className="text-[10px] text-deck-info">
              {expanded ? "\u25BC" : "\u25B6"}
            </span>
            <span className="text-[10px] font-medium text-deck-info">
              {toolName}
            </span>
            <span className="text-[10px] text-deck-muted ml-auto">
              {new Date(event.timestamp).toLocaleTimeString()}
            </span>
          </button>
          {expanded && event.data?.toolInput && (
            <pre className="text-[11px] text-deck-text-dim font-mono mt-1 pl-4 whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
              {typeof event.data.toolInput === "string"
                ? event.data.toolInput
                : JSON.stringify(event.data.toolInput, null, 2)}
            </pre>
          )}
        </div>
      );
    }

    case "tool_result": {
      const content: string = event.data?.content || "";
      const isError = !!event.data?.isError;
      const preview = content.split("\n").slice(0, 2).join("\n");
      return (
        <div
          className={`border-l-2 px-3 py-1.5 rounded-r ${
            isError
              ? "bg-deck-error/10 border-deck-error/60"
              : "bg-deck-surface-2/30 border-deck-border"
          }`}
        >
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1.5 w-full text-left"
          >
            <span
              className={`text-[10px] ${isError ? "text-deck-error" : "text-deck-muted"}`}
            >
              {expanded ? "▼" : "▶"}
            </span>
            <span
              className={`text-[10px] font-medium ${isError ? "text-deck-error" : "text-deck-muted"}`}
            >
              {isError ? "result (error)" : "result"}
            </span>
          </button>
          <pre
            className={`text-[11px] font-mono mt-1 pl-4 whitespace-pre-wrap break-words max-h-64 overflow-y-auto ${
              isError ? "text-deck-error/80" : "text-deck-text-dim"
            }`}
          >
            {expanded ? content || "(no output)" : preview}
          </pre>
        </div>
      );
    }

    case "error":
      return (
        <div className="bg-deck-error/10 border-l-2 border-deck-error px-3 py-1.5 rounded-r">
          <span className="text-[10px] text-deck-error font-medium">ERROR</span>
          <pre className="text-xs text-deck-error/80 font-mono mt-0.5 whitespace-pre-wrap">
            {event.data?.message || event.data?.content || "Unknown error"}
          </pre>
        </div>
      );

    case "complete":
      return (
        <div className="border-t border-deck-border/50 pt-2 mt-2">
          <span className="text-[10px] text-deck-accent font-medium">
            COMPLETED
          </span>
          <div className="text-[10px] text-deck-text-dim mt-0.5 font-mono">
            {event.data?.status}
            {event.data?.costUsd && ` | $${event.data.costUsd.toFixed(4)}`}
            {event.data?.durationMs &&
              ` | ${(event.data.durationMs / 1000).toFixed(1)}s`}
          </div>
        </div>
      );

    default:
      return null;
  }
}
