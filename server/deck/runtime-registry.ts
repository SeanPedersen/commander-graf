/** Runtime discovery and model ownership for locally installed agent CLIs. */

import { execFileSync } from "child_process";
import type { RuntimeType } from "../core/types.js";

export interface RuntimeInfo {
  id: RuntimeType;
  label: string;
  detected: boolean;
}

const RUNTIMES: ReadonlyArray<Pick<RuntimeInfo, "id" | "label"> & { command: string }> = [
  { id: "claude-code", label: "Claude Code", command: "claude" },
  { id: "codex", label: "Codex", command: "codex" },
  { id: "opencode", label: "OpenCode", command: "opencode" },
];

const RUNTIME_LABELS: Record<RuntimeType, string> = Object.fromEntries(
  RUNTIMES.map(({ id, label }) => [id, label])
) as Record<RuntimeType, string>;

const withRuntimePrefix = (
  runtime: RuntimeType,
  values: ReadonlyArray<[string, string]>
): ReadonlyArray<{ value: string; label: string }> =>
  values.map(([value, label]) => ({ value, label: `${RUNTIME_LABELS[runtime]}: ${label}` }));

export const MODELS_BY_RUNTIME: Record<RuntimeType, ReadonlyArray<{ value: string; label: string }>> = {
  "claude-code": withRuntimePrefix("claude-code", [
    ["haiku", "Claude Haiku 4.5"],
    ["sonnet", "Claude Sonnet 4.6"],
    ["opus", "Claude Opus 4.6"],
  ]),
  codex: withRuntimePrefix("codex", [
    ["gpt-5.6-sol", "GPT-5.6 Sol"],
    ["gpt-5.6-terra", "GPT-5.6 Terra"],
    ["gpt-5.6-luna", "GPT-5.6 Luna"],
  ]),
  opencode: withRuntimePrefix("opencode", [
    ["opencode/mimo-v2.5-free", "MiMo-V2.5 (free)"],
    ["opencode/hy3-free", "Hy3 (free)"],
    ["opencode/ling-3.0-flash-fin-free", "Ling 3.0 Flash Fin (free)"],
    ["opencode/nemotron-3-ultra-free", "Nemotron 3 Ultra (free)"],
    ["opencode/nemotron-3.5-lightning-free", "Nemotron 3.5 Lightning (free)"],
    ["opencode/big-pickle", "Big Pickle (stealth)"],
    ["opencode/muse-spark-1.2-contributor-free", "Muse Spark 1.2 Contributor (free)"],
  ]),
};

function isCommandAvailable(command: string): boolean {
  try {
    execFileSync("which", [command], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// This is intentionally evaluated once as the server boots; settings should not
// unexpectedly change while a workflow is being configured or executed.
export const detectedRuntimes: ReadonlyArray<RuntimeInfo> = RUNTIMES.map(({ id, label, command }) => ({
  id,
  label,
  detected: isCommandAvailable(command),
}));

export function runtimeForModel(model: string): RuntimeType | undefined {
  return (Object.keys(MODELS_BY_RUNTIME) as RuntimeType[]).find((runtime) =>
    MODELS_BY_RUNTIME[runtime].some((option) => option.value === model)
  );
}
