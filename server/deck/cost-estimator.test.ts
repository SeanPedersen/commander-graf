/** Token-cost calculation tests. */

import { describe, expect, it } from "vitest";
import { calculateTokenCost } from "./cost-estimator.js";

describe("calculateTokenCost", () => {
  it("uses the cached-input rate for Codex usage", () => {
    expect(calculateTokenCost("gpt-5.6-terra", 1_000_000, 1_000_000, 500_000)).toBeCloseTo(13.1);
  });

  it("does not charge an unknown model with an invented rate", () => {
    expect(calculateTokenCost("unknown", 1_000_000, 1_000_000)).toBe(0);
  });
});
