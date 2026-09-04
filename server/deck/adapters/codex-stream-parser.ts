/**
 * Normalizes Codex `exec --json` events for Agent Deck's runtime-neutral UI.
 */

import { EventEmitter } from "events";
import { v4 as uuidv4 } from "uuid";
import type {
  CompleteEvent,
  ErrorEvent,
  InitEvent,
  StreamEvent,
  TextEvent,
  ThinkingEvent,
  ToolCallEvent,
} from "../../core/types.js";

type CodexItem = {
  id?: string;
  type?: string;
  text?: string;
  summary?: string | Array<{ text?: string }>;
  command?: string;
  arguments?: unknown;
  aggregated_output?: string;
};

type CodexUsage = {
  input_tokens?: number;
  cached_input_tokens?: number;
  output_tokens?: number;
};

type CodexEvent = {
  type?: string;
  thread_id?: string;
  error?: { message?: string } | string;
  message?: string;
  item?: CodexItem;
  usage?: CodexUsage;
  duration_ms?: number;
  info?: { total_token_usage?: CodexUsage };
  turn_token_usage?: CodexUsage;
  payload?: CodexEvent;
};

export class CodexStreamParser extends EventEmitter {
  private buffer = "";
  private threadId: string | null = null;
  private completed = false;
  private latestUsage: CodexUsage | undefined;

  constructor(private readonly agentId: string) {
    super();
  }

  feed(chunk: string): void {
    this.buffer += chunk;
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() || "";
    lines.forEach((line) => this.parseLine(line));
  }

  flush(): void {
    this.parseLine(this.buffer);
    this.buffer = "";
  }

  getSessionId(): string | null {
    return this.threadId;
  }

  hasCompleted(): boolean {
    return this.completed;
  }

  reset(): void {
    this.buffer = "";
    this.threadId = null;
    this.completed = false;
    this.latestUsage = undefined;
  }

  private parseLine(line: string): void {
    if (!line.trim()) return;

    try {
      this.handleEvent(JSON.parse(line) as CodexEvent);
    } catch {
      this.emitError("CODEX_JSONL_PARSE_ERROR", line);
    }
  }

  private handleEvent(event: CodexEvent): void {
    if (event.payload) {
      this.handleEvent({
        ...event.payload,
        thread_id: event.payload.thread_id || event.thread_id,
      });
      return;
    }

    if (event.type === "thread.started" && event.thread_id) {
      this.threadId = event.thread_id;
      this.emitEvent<InitEvent>({
        type: "init",
        agentId: this.agentId,
        timestamp: new Date().toISOString(),
        data: { sessionId: event.thread_id },
      });
      return;
    }

    if (event.type === "item.started" || event.type === "item.completed") {
      this.handleItem(event.item, event.type === "item.completed");
      return;
    }

    if (event.type === "turn.completed") {
      this.completed = true;
      this.emitComplete("success", undefined, event.usage || this.latestUsage);
      return;
    }

    if (event.type === "token_count" || event.type === "token_usage_record") {
      this.latestUsage = event.turn_token_usage || event.info?.total_token_usage || event.usage || this.latestUsage;
      return;
    }

    if (event.type === "task_complete") {
      this.completed = true;
      this.emitComplete("success", undefined, this.latestUsage, event.duration_ms);
      return;
    }

    if (event.type === "turn.failed" || event.type === "error") {
      const message = typeof event.error === "string"
        ? event.error
        : event.error?.message || event.message || "Codex execution failed";
      this.emitError("CODEX_EXEC_ERROR", message);
      this.completed = true;
      this.emitComplete("error", message, event.usage || this.latestUsage);
    }
  }

  private handleItem(item: CodexItem | undefined, completed: boolean): void {
    if (!item?.type) return;

    if (item.type === "agent_message" && item.text) {
      this.emitEvent<TextEvent>({
        type: "text",
        agentId: this.agentId,
        timestamp: new Date().toISOString(),
        data: { content: item.text, isPartial: !completed },
      });
      return;
    }

    if (item.type === "reasoning") {
      const content = typeof item.summary === "string"
        ? item.summary
        : item.summary?.map((entry) => entry.text || "").join("\n") || item.text;
      if (!content) return;
      this.emitEvent<ThinkingEvent>({
        type: "thinking",
        agentId: this.agentId,
        timestamp: new Date().toISOString(),
        data: { content, isPartial: !completed },
      });
      return;
    }

    if (item.type === "command_execution" && item.command) {
      this.emitEvent<ToolCallEvent>({
        type: "tool_call",
        agentId: this.agentId,
        timestamp: new Date().toISOString(),
        data: {
          toolId: item.id || uuidv4(),
          toolName: "shell",
          toolInput: { command: item.command, arguments: item.arguments, output: item.aggregated_output },
        },
      });
    }
  }

  private emitComplete(
    status: "success" | "error",
    error: string | undefined,
    usage: CodexUsage | undefined,
    durationMs?: number,
  ): void {
    this.emitEvent<CompleteEvent>({
      type: "complete",
      agentId: this.agentId,
      timestamp: new Date().toISOString(),
      data: {
        status,
        error,
        durationMs,
        sessionId: this.threadId || undefined,
        inputTokens: usage?.input_tokens,
        cachedInputTokens: usage?.cached_input_tokens,
        outputTokens: usage?.output_tokens,
      },
    });
  }

  private emitError(code: string, message: string): void {
    this.emitEvent<ErrorEvent>({
      type: "error",
      agentId: this.agentId,
      timestamp: new Date().toISOString(),
      data: { code, message },
    });
  }

  private emitEvent<T extends StreamEvent>(event: T): void {
    this.emit("event", event);
  }
}

export interface CodexStreamParser {
  on(event: "event", listener: (event: StreamEvent) => void): this;
}
