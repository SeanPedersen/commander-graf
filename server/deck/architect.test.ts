/** Task graph contract tests. */

import { describe, expect, it } from "vitest";
import { parseJson, parsePlan, validateTaskGraph } from "./architect.js";
import type { PlannedTask } from "../core/types.js";
import { modelForComplexity } from "./model-router.js";

const task = (overrides: Partial<PlannedTask> = {}): PlannedTask => ({
  id: "implement",
  title: "Implement feature",
  prompt: "# Implement\n\nKeep **Markdown** unchanged.",
  workdir: ".",
  dependsOn: [],
  complexity: "medium",
  acceptanceCriteria: ["Tests pass"],
  ...overrides,
});

describe("task graph parsing", () => {
  it("preserves Markdown prompts", () => {
    expect(parsePlan({ tasks: [task()] }).tasks?.[0].prompt).toContain("**Markdown**");
  });

  it("rejects duplicate ids, dangling dependencies, and cycles", () => {
    expect(() => validateTaskGraph([task(), task({ title: "Duplicate" })])).toThrow("Duplicate");
    expect(() => validateTaskGraph([task({ dependsOn: ["missing"] })])).toThrow("unknown");
    expect(() => validateTaskGraph([task({ id: "a", dependsOn: ["b"] }), task({ id: "b", dependsOn: ["a"] })])).toThrow("cycle");
  });

  it("requires an executable prompt and acceptance criteria", () => {
    expect(() => parsePlan({ tasks: [task({ prompt: "" })] })).toThrow("Markdown");
    expect(() => parsePlan({ tasks: [task({ acceptanceCriteria: [] })] })).toThrow("acceptance");
  });

  it("parses valid JSON whose own string fields contain literal ``` fences", () => {
    // Reproduces the real bug: --json-schema's structured_output is already
    // valid JSON, but a task's prompt legitimately quotes a ```python-fenced
    // API spec inside its own string value — a naive fence-stripping regex
    // mistakes that inner fence for the real delimiter and corrupts input
    // that was never wrapped in markdown to begin with.
    const payload = {
      tasks: [task({ prompt: "# Task\nUse this contract:\n```python\ndef choose_move(): ...\n```\nDone." })],
    };
    expect(parseJson(JSON.stringify(payload), "task graph")).toEqual(payload);
  });

  it("extracts JSON from a fenced free-text response as a fallback", () => {
    const payload = { tasks: [task()] };
    const text = `Here is the plan:\n\`\`\`json\n${JSON.stringify(payload)}\n\`\`\``;
    expect(parseJson(text, "task graph")).toEqual(payload);
  });

  it("routes every complexity tier", () => {
    const settings = { lowComplexityModel: "fast", mediumComplexityModel: "balanced", highComplexityModel: "strong" } as any;
    expect(modelForComplexity("low", settings)).toBe("fast");
    expect(modelForComplexity("medium", settings)).toBe("balanced");
    expect(modelForComplexity("high", settings)).toBe("strong");
  });
});
