/**
 * Claude Code CLI Stream Parser (ported from 07-product-app)
 *
 * Parses NDJSON output from `claude --output-format stream-json`
 * and converts it to normalized StreamEvents.
 */

import { EventEmitter } from "events";
import { v4 as uuidv4 } from "uuid";
import type {
  StreamEvent,
  TextEvent,
  ToolCallEvent,
  ToolResultEvent,
  ThinkingEvent,
  HeartbeatEvent,
  CompleteEvent,
  ErrorEvent,
  InitEvent,
  ClaudeCliEvent,
} from "./types.js";

/** Tool result content is either a plain string or a list of content blocks (usually text). */
function stringifyToolResultContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((block: any) => (typeof block?.text === "string" ? block.text : JSON.stringify(block)))
      .join("\n");
  }
  if (content == null) return "";
  return JSON.stringify(content);
}

export class StreamParser extends EventEmitter {
  private agentId: string;
  private buffer: string = "";
  private sessionId: string | null = null;
  private currentTextContent: string = "";
  private currentThinkingContent: string = "";

  constructor(agentId: string) {
    super();
    this.agentId = agentId;
  }

  /** Feed raw data from CLI output */
  feed(data: string): void {
    // Remove ANSI escape codes
    const cleanData = data.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "");
    this.buffer += cleanData;

    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) {
        this.parseLine(trimmed);
      }
    }
  }

  /** Flush remaining buffer content */
  flush(): void {
    if (this.buffer.trim()) {
      this.parseLine(this.buffer.trim());
      this.buffer = "";
    }
  }

  private parseLine(line: string): void {
    try {
      const event = JSON.parse(line) as ClaudeCliEvent;
      this.handleEvent(event);
    } catch {
      if (line.startsWith("Error:") || line.startsWith("error:")) {
        this.emitEvent<ErrorEvent>({
          type: "error",
          agentId: this.agentId,
          timestamp: new Date().toISOString(),
          data: { code: "CLI_ERROR", message: line },
        });
      }
    }
  }

  private handleEvent(event: ClaudeCliEvent): void {
    switch (event.type) {
      case "system":
        if (event.subtype === "init" && event.session_id) {
          this.sessionId = event.session_id;
          this.emitEvent<InitEvent>({
            type: "init",
            agentId: this.agentId,
            timestamp: new Date().toISOString(),
            data: { sessionId: event.session_id },
          });
        }
        // Non-interactive `--print` mode never emits content_block_delta
        // (no incremental text/thinking) and redacts thinking blocks to
        // empty strings — this token tally is the only sign of life during
        // an extended-thinking stretch, which can run well over a minute.
        if (event.subtype === "thinking_tokens" && typeof event.estimated_tokens === "number") {
          this.emitEvent<HeartbeatEvent>({
            type: "heartbeat",
            agentId: this.agentId,
            timestamp: new Date().toISOString(),
            data: { estimatedTokens: event.estimated_tokens },
          });
        }
        break;

      case "assistant":
        if (event.message?.content) {
          for (const block of event.message.content) {
            this.processContentBlock(block);
          }
        }
        break;

      case "user":
        // Tool results come back as content blocks on a synthetic "user"
        // turn — this is the only place the CLI reports what a tool_call
        // (e.g. a Bash command) actually returned.
        if (event.message?.content) {
          for (const block of event.message.content) {
            if (block.type === "tool_result" && block.tool_use_id) {
              this.emitEvent<ToolResultEvent>({
                type: "tool_result",
                agentId: this.agentId,
                timestamp: new Date().toISOString(),
                data: {
                  toolId: block.tool_use_id,
                  content: stringifyToolResultContent(block.content),
                  isError: block.is_error,
                },
              });
            }
          }
        }
        break;

      case "content_block_start":
        if (event.content_block?.type === "tool_use" && event.content_block.name) {
          this.emitEvent<ToolCallEvent>({
            type: "tool_call",
            agentId: this.agentId,
            timestamp: new Date().toISOString(),
            data: {
              toolId: event.content_block.id || uuidv4(),
              toolName: event.content_block.name,
              toolInput: event.content_block.input || {},
            },
          });
        }
        break;

      case "content_block_delta":
        if (event.delta?.type === "text_delta" && event.delta.text) {
          this.currentTextContent += event.delta.text;
          this.emitEvent<TextEvent>({
            type: "text",
            agentId: this.agentId,
            timestamp: new Date().toISOString(),
            data: { content: event.delta.text, isPartial: true },
          });
        }
        if (event.delta?.type === "thinking_delta" && event.delta.thinking) {
          this.currentThinkingContent += event.delta.thinking;
          this.emitEvent<ThinkingEvent>({
            type: "thinking",
            agentId: this.agentId,
            timestamp: new Date().toISOString(),
            data: { content: event.delta.thinking, isPartial: true },
          });
        }
        break;

      case "content_block_stop":
        if (this.currentTextContent) {
          this.emitEvent<TextEvent>({
            type: "text",
            agentId: this.agentId,
            timestamp: new Date().toISOString(),
            data: { content: this.currentTextContent, isPartial: false },
          });
          this.currentTextContent = "";
        }
        if (this.currentThinkingContent) {
          this.emitEvent<ThinkingEvent>({
            type: "thinking",
            agentId: this.agentId,
            timestamp: new Date().toISOString(),
            data: { content: this.currentThinkingContent, isPartial: false },
          });
          this.currentThinkingContent = "";
        }
        break;

      case "result":
        // Result events in stream-json have fields at top level
        this.emitEvent<CompleteEvent>({
          type: "complete",
          agentId: this.agentId,
          timestamp: new Date().toISOString(),
          data: {
            status: event.is_error ? "error" : "success",
            error: event.is_error ? (event.result || "Unknown error") : undefined,
            durationMs: event.duration_ms,
            sessionId: event.session_id || this.sessionId || undefined,
            costUsd: event.total_cost_usd,
            inputTokens: event.usage?.input_tokens,
            outputTokens: event.usage?.output_tokens,
          },
        });
        break;

      case "error":
        this.emitEvent<ErrorEvent>({
          type: "error",
          agentId: this.agentId,
          timestamp: new Date().toISOString(),
          data: { code: "CLI_ERROR", message: event.error || "Unknown error" },
        });
        break;
    }
  }

  private processContentBlock(block: {
    type: string;
    text?: string;
    name?: string;
    input?: unknown;
    thinking?: string;
    id?: string;
  }): void {
    switch (block.type) {
      case "text":
        if (block.text) {
          this.emitEvent<TextEvent>({
            type: "text",
            agentId: this.agentId,
            timestamp: new Date().toISOString(),
            data: { content: block.text, isPartial: false },
          });
        }
        break;
      case "thinking":
        if (block.thinking) {
          this.emitEvent<ThinkingEvent>({
            type: "thinking",
            agentId: this.agentId,
            timestamp: new Date().toISOString(),
            data: { content: block.thinking, isPartial: false },
          });
        }
        break;
      case "tool_use":
        if (block.name) {
          this.emitEvent<ToolCallEvent>({
            type: "tool_call",
            agentId: this.agentId,
            timestamp: new Date().toISOString(),
            data: {
              toolId: block.id || uuidv4(),
              toolName: block.name,
              toolInput: block.input || {},
            },
          });
        }
        break;
    }
  }

  private emitEvent<T extends StreamEvent>(event: T): void {
    this.emit("event", event);
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  reset(): void {
    this.buffer = "";
    this.sessionId = null;
    this.currentTextContent = "";
    this.currentThinkingContent = "";
  }
}
