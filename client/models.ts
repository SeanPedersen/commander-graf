/**
 * Model catalog and runtime ownership used by settings and plan configuration.
 */

export type RuntimeType = "claude-code" | "codex" | "opencode";

export interface ModelOption {
  value: string;
  label: string;
  runtime: RuntimeType;
}

const models = (runtime: RuntimeType, values: ReadonlyArray<[string, string]>): ModelOption[] =>
  values.map(([value, label]) => ({ value, label, runtime }));

export const MODELS_BY_RUNTIME: Record<RuntimeType, readonly ModelOption[]> = {
  "claude-code": models("claude-code", [["haiku", "Claude Haiku 4.5"], ["sonnet", "Claude Sonnet 4.6"], ["opus", "Claude Opus 4.6"]]),
  codex: models("codex", [["gpt-5.6-sol", "GPT-5.6 Sol"], ["gpt-5.6-terra", "GPT-5.6 Terra"], ["gpt-5.6-luna", "GPT-5.6 Luna"]]),
  opencode: models("opencode", [["opencode/big-pickle", "Big Pickle (free)"], ["opencode/gpt-5-nano", "GPT-5 Nano (free)"], ["opencode/glm-4.7-free", "GLM 4.7 (free)"], ["opencode/minimax-m2.1-free", "MiniMax M2.1 (free)"]]),
};

export function getModelOptions(activeRuntimes: readonly RuntimeType[]): readonly ModelOption[] {
  return activeRuntimes.flatMap((runtime) => MODELS_BY_RUNTIME[runtime] ?? []);
}

export function runtimeForModel(model: string): RuntimeType | undefined {
  return (Object.keys(MODELS_BY_RUNTIME) as RuntimeType[]).find((runtime) =>
    MODELS_BY_RUNTIME[runtime].some((option) => option.value === model)
  );
}
