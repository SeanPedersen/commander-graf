/**
 * Normalizes OpenCode `run --format json` events for Commander Graf's runtime-neutral UI.
 */

import { EventEmitter } from "events";
import type {
  CompleteEvent,
  ErrorEvent,
  InitEvent,
  StreamEvent,
  TextEvent,
  ToolCallEvent,
} from "../../core/types.js";

type OpenCodeToolState = {
  status?: string;
  input?: unknown;
  output?: string;
};

type OpenCodePart = {
  type?: string;
  text?: string;
  tool?: string;
  callID?: string;
  title?: string;
  state?: OpenCodeToolState;
  tokens?: { input?: number; output?: number };
  cost?: number;
};

type OpenCodeEvent = {
  type?: string;
  sessionID?: string;
  part?: OpenCodePart;
  error?: { name?: string; data?: { message?: string } } | string;
};

export class OpenCodeStreamParser extends EventEmitter {
  private buffer = "";
  private sessionId: string | null = null;
  private completed = false;
  private inputTokens = 0;
  private outputTokens = 0;
  private costUsd = 0;

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
    return this.sessionId;
  }

  hasCompleted(): boolean {
    return this.completed;
  }

  getUsage(): { inputTokens: number; outputTokens: number; costUsd: number } {
    return { inputTokens: this.inputTokens, outputTokens: this.outputTokens, costUsd: this.costUsd };
  }

  reset(): void {
    this.buffer = "";
    this.sessionId = null;
    this.completed = false;
    this.inputTokens = 0;
    this.outputTokens = 0;
    this.costUsd = 0;
  }

  private parseLine(line: string): void {
    if (!line.trim()) return;

    try {
      this.handleEvent(JSON.parse(line) as OpenCodeEvent);
    } catch {
      this.emitError("OPENCODE_JSONL_PARSE_ERROR", line);
    }
  }

  private handleEvent(event: OpenCodeEvent): void {
    if (event.sessionID && !this.sessionId) {
      this.sessionId = event.sessionID;
      this.emitEvent<InitEvent>({
        type: "init",
        agentId: this.agentId,
        timestamp: new Date().toISOString(),
        data: { sessionId: event.sessionID },
      });
    }

    if (event.type === "error") {
      const message = typeof event.error === "string"
        ? event.error
        : event.error?.data?.message || event.error?.name || "OpenCode run failed";
      this.completed = true;
      this.emitError("OPENCODE_RUN_ERROR", message);
      this.emitComplete("error", message);
      return;
    }

    this.handlePart(event.part);
  }

  private handlePart(part: OpenCodePart | undefined): void {
    if (!part?.type) return;

    if (part.type === "text" && part.text) {
      this.emitEvent<TextEvent>({
        type: "text",
        agentId: this.agentId,
        timestamp: new Date().toISOString(),
        data: { content: part.text },
      });
      return;
    }

    if (part.type === "tool") {
      this.emitEvent<ToolCallEvent>({
        type: "tool_call",
        agentId: this.agentId,
        timestamp: new Date().toISOString(),
        data: {
          toolId: part.callID || part.title || "tool",
          toolName: part.tool || "unknown",
          toolInput: { input: part.state?.input, output: part.state?.output, title: part.title },
        },
      });
      return;
    }

    if (part.type === "step-finish") {
      this.inputTokens += part.tokens?.input || 0;
      this.outputTokens += part.tokens?.output || 0;
      this.costUsd += part.cost || 0;
    }
  }

  private emitComplete(status: "success" | "error", error?: string): void {
    this.emitEvent<CompleteEvent>({
      type: "complete",
      agentId: this.agentId,
      timestamp: new Date().toISOString(),
      data: {
        status,
        error,
        sessionId: this.sessionId || undefined,
        inputTokens: this.inputTokens || undefined,
        outputTokens: this.outputTokens || undefined,
        costUsd: this.costUsd || undefined,
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

export interface OpenCodeStreamParser {
  on(event: "event", listener: (event: StreamEvent) => void): this;
}
