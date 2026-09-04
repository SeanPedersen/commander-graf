/** Application settings, including the startup-detected runtime controls. */

import { useEffect, useMemo, useState } from "react";
import { getModelOptions, type RuntimeType } from "../models";

const API_BASE = "/api/deck";

interface RuntimeInfo { id: RuntimeType; label: string; detected: boolean; }
interface DeckSettings {
  maxAgents: number;
  maxBudgetUsd: number;
  activeRuntimes: RuntimeType[];
  plannerModel: string;
  explorerModel: string;
  lowComplexityModel: string;
  mediumComplexityModel: string;
  highComplexityModel: string;
}

const DEFAULT_SETTINGS: DeckSettings = {
  maxAgents: 10, maxBudgetUsd: 10, activeRuntimes: [],
  plannerModel: "sonnet", explorerModel: "haiku", lowComplexityModel: "haiku", mediumComplexityModel: "sonnet", highComplexityModel: "opus",
};

const ROUTES = [["plannerModel", "Planner"], ["explorerModel", "Explorer"], ["lowComplexityModel", "Low complexity"], ["mediumComplexityModel", "Medium complexity"], ["highComplexityModel", "High complexity"]] as const;

export function Settings() {
  const [settings, setSettings] = useState<DeckSettings>(DEFAULT_SETTINGS);
  const [runtimes, setRuntimes] = useState<RuntimeInfo[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const modelOptions = useMemo(() => getModelOptions(settings.activeRuntimes), [settings.activeRuntimes]);

  useEffect(() => {
    fetch(`${API_BASE}/settings`).then((response) => response.ok ? response.json() : null).then((data) => {
      if (!data) return;
      setSettings(data);
      setRuntimes(data.runtimes ?? []);
    }).catch(() => {});
  }, []);

  const toggleRuntime = (runtime: RuntimeType) => setSettings((current) => ({
    ...current,
    activeRuntimes: current.activeRuntimes.includes(runtime)
      ? current.activeRuntimes.filter((id) => id !== runtime)
      : [...current.activeRuntimes, runtime],
  }));

  const handleSave = async () => {
    setSaving(true); setSaved(false); setSaveError(null);
    try {
      const response = await fetch(`${API_BASE}/settings`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings) });
      if (!response.ok) throw new Error("Unable to save settings");
      const data = await response.json();
      setSettings(data); setRuntimes(data.runtimes ?? runtimes); setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { setSaveError("Unable to save settings. Please try again."); }
    finally { setSaving(false); }
  };

  return <div className="h-full overflow-y-auto p-6"><div className="max-w-2xl mx-auto space-y-8">
    <section><h2 className="text-sm font-semibold text-deck-text-bright mb-4">Runtimes</h2><div className="space-y-3 bg-deck-surface rounded-lg border border-deck-border p-5">
      <p className="text-xs text-deck-muted">Detected when Agent Deck started. Only active runtimes contribute models to routing.</p>
      {runtimes.map((runtime) => <label key={runtime.id} className={`flex items-center justify-between rounded border p-3 ${runtime.detected ? "border-deck-border" : "border-deck-border opacity-50"}`}><span><span className="text-xs text-deck-text">{runtime.label}</span><span className="ml-2 text-[10px] text-deck-muted">{runtime.detected ? "Detected" : "Not installed"}</span></span><input type="checkbox" checked={settings.activeRuntimes.includes(runtime.id)} disabled={!runtime.detected} onChange={() => toggleRuntime(runtime.id)} className="accent-deck-accent" /></label>)}
    </div></section>
    <section><h2 className="text-sm font-semibold text-deck-text-bright mb-4">General Settings</h2><div className="space-y-4 bg-deck-surface rounded-lg border border-deck-border p-5">
      <div className="grid grid-cols-2 gap-4"><label className="text-[10px] uppercase text-deck-muted">Max Concurrent Agents<input type="number" value={settings.maxAgents} onChange={(event) => setSettings({ ...settings, maxAgents: parseInt(event.target.value) || 1 })} min={1} max={50} className="mt-1 w-full text-xs font-mono px-3 py-2 bg-deck-surface-2 border border-deck-border rounded text-deck-text" /></label><label className="text-[10px] uppercase text-deck-muted">Max Budget (USD)<input type="number" value={settings.maxBudgetUsd} onChange={(event) => setSettings({ ...settings, maxBudgetUsd: parseFloat(event.target.value) || 1 })} min={0.1} step={0.5} className="mt-1 w-full text-xs font-mono px-3 py-2 bg-deck-surface-2 border border-deck-border rounded text-deck-text" /></label></div>
      <div><label className="text-[10px] uppercase text-deck-muted block mb-2">Model routing</label>{modelOptions.length === 0 ? <p className="text-xs text-deck-muted">Enable a detected runtime to configure model routing.</p> : <div className="grid grid-cols-2 gap-3">{ROUTES.map(([key, label]) => <label key={key} className="text-xs text-deck-text-dim">{label}<select value={settings[key]} onChange={(event) => setSettings({ ...settings, [key]: event.target.value })} className="mt-1 w-full text-xs px-3 py-2 bg-deck-surface-2 border border-deck-border rounded text-deck-text">{!modelOptions.some((model) => model.value === settings[key]) && <option value={settings[key]}>{settings[key]} (inactive)</option>}{modelOptions.map((model) => <option key={model.value} value={model.value}>{model.label}</option>)}</select></label>)}</div>}</div>
      <div className="flex justify-end pt-2">{saveError && <span className="mr-3 self-center text-xs text-deck-error">{saveError}</span>}<button onClick={handleSave} disabled={saving} className="px-4 py-2 text-xs bg-deck-accent text-white rounded-lg hover:bg-deck-accent-hover disabled:opacity-40 transition-colors font-medium">{saving ? "Saving..." : saved ? "Saved" : "Save Settings"}</button></div>
    </div></section>
  </div></div>;
}
