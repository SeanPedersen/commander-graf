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

export const MODELS_BY_RUNTIME: Record<RuntimeType, ReadonlyArray<{ value: string; label: string }>> = {
  "claude-code": [
    { value: "haiku", label: "Claude Haiku 4.5" },
    { value: "sonnet", label: "Claude Sonnet 4.6" },
    { value: "opus", label: "Claude Opus 4.6" },
  ],
  codex: [
    { value: "gpt-5.6-sol", label: "GPT-5.6 Sol" },
    { value: "gpt-5.6-terra", label: "GPT-5.6 Terra" },
    { value: "gpt-5.6-luna", label: "GPT-5.6 Luna" },
  ],
  opencode: [
    { value: "opencode/big-pickle", label: "Big Pickle (free)" },
    { value: "opencode/gpt-5-nano", label: "GPT-5 Nano (free)" },
    { value: "opencode/glm-4.7-free", label: "GLM 4.7 (free)" },
    { value: "opencode/minimax-m2.1-free", label: "MiniMax M2.1 (free)" },
  ],
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
