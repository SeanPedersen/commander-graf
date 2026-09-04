/** Codex JSONL protocol compatibility tests. */

import { describe, expect, it } from "vitest";
import { CodexStreamParser } from "./codex-stream-parser.js";
import type { StreamEvent } from "../../core/types.js";

describe("CodexStreamParser", () => {
  it("completes with the final token count emitted by current Codex CLI", () => {
    const parser = new CodexStreamParser("agent-1");
    const events: StreamEvent[] = [];
    parser.on("event", (event) => events.push(event));

    parser.feed(`${JSON.stringify({ type: "thread.started", thread_id: "thread-1" })}\n`);
    parser.feed(`${JSON.stringify({
      type: "event_msg",
      payload: {
        type: "token_count",
        info: { total_token_usage: { input_tokens: 1_000, cached_input_tokens: 800, output_tokens: 100 } },
      },
    })}\n`);
    parser.feed(`${JSON.stringify({ type: "event_msg", payload: { type: "task_complete", duration_ms: 42 } })}\n`);

    expect(events).toMatchObject([
      { type: "init", data: { sessionId: "thread-1" } },
      {
        type: "complete",
        data: {
          status: "success",
          durationMs: 42,
          inputTokens: 1_000,
          cachedInputTokens: 800,
          outputTokens: 100,
        },
      },
    ]);
  });
});
