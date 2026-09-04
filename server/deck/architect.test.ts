/** Task graph contract tests. */

import { describe, expect, it } from "vitest";
import { parsePlan, validateTaskGraph } from "./architect.js";
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

  it("routes every complexity tier", () => {
    const settings = { lowComplexityModel: "fast", mediumComplexityModel: "balanced", highComplexityModel: "strong" } as any;
    expect(modelForComplexity("low", settings)).toBe("fast");
    expect(modelForComplexity("medium", settings)).toBe("balanced");
    expect(modelForComplexity("high", settings)).toBe("strong");
  });
});
