/**
 * Settings - Configuration page for Agent Deck.
 * Settings form and model-routing configuration.
 */

import { useState, useEffect } from "react";
import {
  getRuntimeModel,
  MODELS_BY_RUNTIME,
  type RuntimeType,
} from "../models";

const API_BASE = "/api/deck";

interface DeckSettings {
  maxAgents: number;
  maxBudgetUsd: number;
  defaultModel: string;
  defaultRuntime: RuntimeType;
  plannerModel: string;
  explorerModel: string;
  lowComplexityModel: string;
  mediumComplexityModel: string;
  highComplexityModel: string;
}

export function Settings() {
  const [settings, setSettings] = useState<DeckSettings>({
    maxAgents: 10,
    maxBudgetUsd: 10,
    defaultModel: "sonnet",
    defaultRuntime: "claude-code",
    plannerModel: "sonnet", explorerModel: "haiku", lowComplexityModel: "haiku", mediumComplexityModel: "sonnet", highComplexityModel: "opus",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const modelOptions = MODELS_BY_RUNTIME[settings.defaultRuntime];

  const handleRuntimeChange = (runtime: RuntimeType) => {
    setSettings((currentSettings) => {
      return {
        ...currentSettings,
        defaultRuntime: runtime,
        defaultModel: getRuntimeModel(runtime, currentSettings.defaultModel),
        plannerModel: getRuntimeModel(runtime, currentSettings.plannerModel),
        explorerModel: getRuntimeModel(runtime, currentSettings.explorerModel),
        lowComplexityModel: getRuntimeModel(runtime, currentSettings.lowComplexityModel),
        mediumComplexityModel: getRuntimeModel(runtime, currentSettings.mediumComplexityModel),
        highComplexityModel: getRuntimeModel(runtime, currentSettings.highComplexityModel),
      };
    });
  };

  useEffect(() => {
    async function load() {
      try {
        const settingsRes = await fetch(`${API_BASE}/settings`);

        if (settingsRes.ok) setSettings(await settingsRes.json());
      } catch {
        // Retain the local defaults when the API is unavailable.
      }
    }
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setSaveError(null);

    try {
      const response = await fetch(`${API_BASE}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!response.ok) throw new Error("Unable to save settings");

      setSettings(await response.json());
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setSaveError("Unable to save settings. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto space-y-8">
        {/* General settings */}
        <section>
          <h2 className="text-sm font-semibold text-deck-text-bright mb-4">
            General Settings
          </h2>
          <div className="space-y-4 bg-deck-surface rounded-lg border border-deck-border p-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] uppercase text-deck-muted block mb-1">
                  Max Concurrent Agents
                </label>
                <input
                  type="number"
                  value={settings.maxAgents}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      maxAgents: parseInt(e.target.value) || 1,
                    })
                  }
                  min={1}
                  max={50}
                  className="w-full text-xs font-mono px-3 py-2 bg-deck-surface-2 border border-deck-border rounded text-deck-text focus:outline-none focus:border-deck-accent"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase text-deck-muted block mb-1">
                  Max Budget (USD)
                </label>
                <input
                  type="number"
                  value={settings.maxBudgetUsd}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      maxBudgetUsd: parseFloat(e.target.value) || 1,
                    })
                  }
                  min={0.1}
                  step={0.5}
                  className="w-full text-xs font-mono px-3 py-2 bg-deck-surface-2 border border-deck-border rounded text-deck-text focus:outline-none focus:border-deck-accent"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] uppercase text-deck-muted block mb-2">Model routing</label>
              <div className="grid grid-cols-2 gap-3">
                {([['plannerModel', 'Planner'], ['explorerModel', 'Explorer'], ['lowComplexityModel', 'Low complexity'], ['mediumComplexityModel', 'Medium complexity'], ['highComplexityModel', 'High complexity']] as const).map(([key, label]) => <label key={key} className="text-xs text-deck-text-dim">{label}<select value={settings[key]} onChange={(e) => setSettings({ ...settings, [key]: e.target.value })} className="mt-1 w-full text-xs px-3 py-2 bg-deck-surface-2 border border-deck-border rounded text-deck-text">{modelOptions.map((model) => <option key={model.value} value={model.value}>{model.label}</option>)}</select></label>)}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] uppercase text-deck-muted block mb-1">
                  Default Runtime
                </label>
                <select
                  value={settings.defaultRuntime}
                  onChange={(e) => handleRuntimeChange(e.target.value as RuntimeType)}
                  className="w-full text-xs px-3 py-2 bg-deck-surface-2 border border-deck-border rounded text-deck-text focus:outline-none focus:border-deck-accent"
                >
                  <option value="claude-code">Claude Code</option>
                  <option value="codex">Codex</option>
                  <option value="gemini-cli">Gemini CLI</option>
                  <option value="litellm">LiteLLM Proxy</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase text-deck-muted block mb-1">
                  Default Model
                </label>
                <select
                  value={settings.defaultModel}
                  onChange={(e) =>
                    setSettings({ ...settings, defaultModel: e.target.value })
                  }
                  className="w-full text-xs px-3 py-2 bg-deck-surface-2 border border-deck-border rounded text-deck-text focus:outline-none focus:border-deck-accent"
                >
                  {modelOptions.map((model) => (
                    <option key={model.value} value={model.value}>
                      {model.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              {saveError && (
                <span className="mr-3 self-center text-xs text-deck-error">
                  {saveError}
                </span>
              )}
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-xs bg-deck-accent text-white rounded-lg hover:bg-deck-accent-hover disabled:opacity-40 transition-colors font-medium"
              >
                {saving ? "Saving..." : saved ? "Saved" : "Save Settings"}
              </button>
            </div>
          </div>
        </section>

        {/* Keyboard Shortcuts */}
        <section>
          <h2 className="text-sm font-semibold text-deck-text-bright mb-4">
            Keyboard Shortcuts
          </h2>
          <div className="bg-deck-surface rounded-lg border border-deck-border p-5">
            <div className="space-y-2 text-xs">
              {[
                ["Cmd/Ctrl + 1", "Command Center"],
                ["Cmd/Ctrl + 2", "History"],
                ["Cmd/Ctrl + 3", "Settings"],
                ["1-9", "Select agent by index"],
                ["Escape", "Deselect / close panel"],
              ].map(([key, desc]) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-deck-text-dim">{desc}</span>
                  <kbd className="text-[10px] font-mono px-2 py-0.5 bg-deck-surface-2 border border-deck-border rounded text-deck-muted">
                    {key}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
