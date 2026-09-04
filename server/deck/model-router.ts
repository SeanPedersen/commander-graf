/** Resolves execution models from task complexity at workflow launch. */

import type { DeckSettings, PlannedTask } from "../core/types.js";

export function modelForComplexity(complexity: PlannedTask["complexity"], settings: DeckSettings): string {
  if (complexity === "low") return settings.lowComplexityModel;
  if (complexity === "high") return settings.highComplexityModel;
  return settings.mediumComplexityModel;
}
