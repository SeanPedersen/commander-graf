/**
 * Runtime-specific model options used throughout the client.
 */

export type RuntimeType = "claude-code" | "codex" | "gemini-cli" | "litellm";

export interface ModelOption {
  value: string;
  label: string;
}

export const MODELS_BY_RUNTIME: Record<RuntimeType, readonly ModelOption[]> = {
  "claude-code": [
    { value: "haiku", label: "Haiku 4.5" },
    { value: "sonnet", label: "Sonnet 4.6" },
    { value: "opus", label: "Opus 4.6" },
  ],
  codex: [
    { value: "gpt-5.6-sol", label: "GPT-5.6 Sol" },
    { value: "gpt-5.6-terra", label: "GPT-5.6 Terra" },
    { value: "gpt-5.6-luna", label: "GPT-5.6 Luna" },
  ],
  "gemini-cli": [
    { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  ],
  litellm: [
    { value: "haiku", label: "Haiku 4.5" },
    { value: "sonnet", label: "Sonnet 4.6" },
    { value: "opus", label: "Opus 4.6" },
  ],
};

export function getModelOptions(runtime: string): readonly ModelOption[] {
  return MODELS_BY_RUNTIME[runtime as RuntimeType] ?? MODELS_BY_RUNTIME["claude-code"];
}

export function getRuntimeModel(runtime: string, currentModel: string): string {
  const options = getModelOptions(runtime);
  return options.some((model) => model.value === currentModel)
    ? currentModel
    : options[0].value;
}
