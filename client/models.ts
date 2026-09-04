/**
 * Model catalog and runtime ownership used by settings and plan configuration.
 */

export type RuntimeType = "claude-code" | "codex" | "opencode";

export interface ModelOption {
  value: string;
  label: string;
  runtime: RuntimeType;
}

const RUNTIME_LABELS: Record<RuntimeType, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  opencode: "OpenCode",
};

const models = (runtime: RuntimeType, values: ReadonlyArray<[string, string]>): ModelOption[] =>
  values.map(([value, label]) => ({ value, label: `${RUNTIME_LABELS[runtime]}: ${label}`, runtime }));

export const MODELS_BY_RUNTIME: Record<RuntimeType, readonly ModelOption[]> = {
  "claude-code": models("claude-code", [["haiku", "Claude Haiku 4.5"], ["sonnet", "Claude Sonnet 4.6"], ["opus", "Claude Opus 4.6"]]),
  codex: models("codex", [["gpt-5.6-sol", "GPT-5.6 Sol"], ["gpt-5.6-terra", "GPT-5.6 Terra"], ["gpt-5.6-luna", "GPT-5.6 Luna"]]),
  opencode: models("opencode", [
    ["opencode/mimo-v2.5-free", "MiMo-V2.5 (free)"],
    ["opencode/hy3-free", "Hy3 (free)"],
    ["opencode/ling-3.0-flash-fin-free", "Ling 3.0 Flash Fin (free)"],
    ["opencode/nemotron-3-ultra-free", "Nemotron 3 Ultra (free)"],
    ["opencode/nemotron-3.5-lightning-free", "Nemotron 3.5 Lightning (free)"],
    ["opencode/big-pickle", "Big Pickle (stealth)"],
    ["opencode/muse-spark-1.2-contributor-free", "Muse Spark 1.2 Contributor (free)"],
  ]),
};

export function getModelOptions(activeRuntimes: readonly RuntimeType[]): readonly ModelOption[] {
  return activeRuntimes.flatMap((runtime) => MODELS_BY_RUNTIME[runtime] ?? []);
}

export function runtimeForModel(model: string): RuntimeType | undefined {
  return (Object.keys(MODELS_BY_RUNTIME) as RuntimeType[]).find((runtime) =>
    MODELS_BY_RUNTIME[runtime].some((option) => option.value === model)
  );
}
