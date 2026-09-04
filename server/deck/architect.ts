/**
 * Architect Agent - AI-powered task decomposition.
 *
 * Takes a task description + ProjectStructure → calls the configured CLI → returns MissionPlan.
 */

import { spawn, execSync } from "child_process";
import os from "os";
import path from "path";
import fs from "fs";
import { StreamParser } from "./stream-parser.js";
import { CodexStreamParser } from "./adapters/codex-stream-parser.js";
import type { ProjectStructure, MissionPlan, PlannedTask, StreamEvent, PromptEvent } from "./types.js";
import type { DeckSettings } from "../core/types.js";

type PlannerSettings = Pick<DeckSettings, "defaultRuntime" | "plannerModel" | "explorerModel">;

/** Resolve the claude binary path (same logic as ClaudeAdapter) */
function resolveClaudePath(): string {
  const candidates = [
    path.join(os.homedir(), ".local", "bin", "claude"),
    path.join(os.homedir(), ".npm-global", "bin", "claude"),
    "/usr/local/bin/claude",
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {}
  }
  try {
    return execSync("which claude", { encoding: "utf8" }).trim();
  } catch {
    return "claude";
  }
}

const CLAUDE_BIN = resolveClaudePath();

function resolveCodexPath(): string {
  const candidates = [
    path.join(os.homedir(), ".local", "bin", "codex"),
    "/usr/local/bin/codex",
  ];
  const installed = candidates.find((candidate) => fs.existsSync(candidate));
  if (installed) return installed;

  try {
    return execSync("which codex", { encoding: "utf8" }).trim();
  } catch {
    return "codex";
  }
}

const CODEX_BIN = resolveCodexPath();

/** Generate a mission plan from a task description and project structure */
export async function planMission(
  task: string,
  project: ProjectStructure,
  settings: PlannerSettings,
  onEvent?: (event: StreamEvent) => void
): Promise<MissionPlan> {
  const prompt = buildPlannerPrompt(task, project, settings.explorerModel);
  emitPrompt(onEvent, prompt, settings.plannerModel, settings.explorerModel);
  emitProgress(onEvent, "running", settings.plannerModel, settings.explorerModel);
  const result = await callPlanner(prompt, project.root, settings, onEvent);
  emitProgress(onEvent, "completed", settings.plannerModel, settings.explorerModel);
  return parsePlan(parseJson(result, "task graph"), project);
}

function projectContext(project: ProjectStructure): string {
  const projectCtx = [
    `Project: ${project.name}`,
    `Type: ${project.type}`,
    project.framework ? `Framework: ${project.framework}` : null,
    project.packages.length > 0
      ? `Packages: ${project.packages.map((p) => `${p.name} (${p.type}, ${p.path})`).join(", ")}`
      : null,
    `Claude Config: CLAUDE.md=${project.hasClaudeMd}, .mcp.json=${project.hasMcpJson}, agents=${project.agentCount}, skills=${project.skillCount}, MCP servers=${project.mcpServerCount}`,
  ]
    .filter(Boolean)
    .join("\n");
  return projectCtx;
}

function buildPlannerPrompt(task: string, project: ProjectStructure, explorerModel: string): string {
  return `You are the sole planning session for this build task. You own triage, bounded repository exploration, and synthesis.

## Project Context
${projectContext(project)}

## Task
${task}

## Planning instructions
1. Triage the request and investigate the repository before composing tasks.
2. For bounded evidence gathering, use the configured cheap exploration model "${explorerModel}" for narrowly scoped questions. Limit exploration to four questions, and use no more than one additional follow-up round.
3. Design an executable task graph from that evidence:
   - Make each task atomic: one clear, independently reviewable outcome with no overlapping ownership.
   - Keep prompts concrete, scoped to the relevant files or symbols, and include verifiable acceptance criteria.
   - Prefer parallel root tasks. Add a dependency only when a task needs another task's completed output; never add cosmetic ordering or cycles.
   - Use complexity for implementation/reasoning scope only; do not include model or runtime selection in a task.
4. Briefly stream what you are checking as you work, then return ONLY this JSON object: {"tasks":[{"id":"kebab-id","title":"short title","prompt":"# Task\\n...","workdir":".","dependsOn":[],"complexity":"low|medium|high","acceptanceCriteria":["verifiable criterion"]}]}.`;
}

function emitPrompt(
  onEvent: ((event: StreamEvent) => void) | undefined,
  content: string,
  model: string,
  explorerModel: string
): void {
  onEvent?.({
    type: "prompt",
    agentId: "architect",
    timestamp: new Date().toISOString(),
    data: { content, stage: "planner", model, explorerModel },
  } as PromptEvent);
}

function emitProgress(
  onEvent: ((event: StreamEvent) => void) | undefined,
  status: string,
  model: string,
  explorerModel: string
): void {
  onEvent?.({
    type: "text",
    agentId: "architect",
    timestamp: new Date().toISOString(),
    data: { planning: { stage: "planner", status, model, explorerModel } },
  });
}

function parseJson(text: string, label: string): any {
  const match = text.trim().match(/```(?:json)?\s*([\s\S]*?)```/) || text.trim().match(/\{[\s\S]*\}/);
  try { return JSON.parse(match?.[1] || match?.[0] || text); } catch (error) { throw new Error(`Failed to parse ${label} response: ${(error as Error).message}`); }
}

function callPlanner(
  prompt: string,
  cwd: string,
  settings: PlannerSettings,
  onEvent?: (event: StreamEvent) => void
): Promise<string> {
  if (settings.defaultRuntime === "codex") {
    return callCodex(prompt, cwd, settings.plannerModel, onEvent);
  }

  return callClaude(prompt, cwd, settings.plannerModel, onEvent);
}

function callClaude(
  prompt: string,
  cwd: string,
  model: string,
  onEvent?: (event: StreamEvent) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const parser = onEvent ? new StreamParser("architect") : null;
    parser?.on("event", (event: StreamEvent) => onEvent!(event));

    const args = [
      "--print",
      prompt,
      "--output-format",
      "stream-json",
      "--verbose",
      "--model",
      model,
    ];

    const envPath = [
      process.env.PATH || "",
      path.join(os.homedir(), ".local", "bin"),
      "/usr/local/bin",
    ].join(":");

    const proc = spawn(CLAUDE_BIN, args, {
      cwd,
      env: {
        ...process.env,
        PATH: envPath,
        HOME: os.homedir(),
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    proc.stdin?.end();

    let output = "";
    let resultText = "";

    proc.stdout?.on("data", (data: Buffer) => {
      const text = data.toString();
      output += text;
      parser?.feed(text);
    });

    proc.stderr?.on("data", () => {
      // Ignore stderr (may contain progress info)
    });

    proc.on("error", (err) => {
      reject(new Error(`Failed to spawn Claude CLI: ${err.message}`));
    });

    proc.on("exit", (code) => {
      clearTimeout(timeout);
      parser?.flush();

      if (code !== 0 && !output) {
        reject(new Error(`Claude CLI exited with code ${code}`));
        return;
      }

      // Parse stream-json output to extract the result text
      const lines = output.split("\n").filter((l) => l.trim());
      for (const line of lines) {
        try {
          const event = JSON.parse(line);
          // Look for result event (has "result" field at top level)
          if (event.result) {
            resultText = event.result;
          }
          // Also check for assistant message content blocks
          if (event.type === "assistant" && event.message?.content) {
            for (const block of event.message.content) {
              if (block.type === "text" && block.text) {
                resultText = block.text;
              }
            }
          }
          // Check content_block_stop with accumulated text
          if (event.type === "content_block_stop" || event.type === "message_stop") {
            // result already captured above
          }
        } catch {
          // Not JSON, skip
        }
      }

      if (!resultText) {
        // Fallback: try to find JSON in raw output
        const jsonMatch = output.match(/\{[\s\S]*"agents"[\s\S]*\}/);
        if (jsonMatch) {
          resultText = jsonMatch[0];
        }
      }

      if (resultText) {
        resolve(resultText);
      } else {
        reject(new Error("No result from Claude CLI"));
      }
    });

    // Planning now involves real tool calls (Read/Grep/Glob) to investigate the
    // codebase, not just a single completion, so give it more room than a plain
    // one-shot prompt would need.
    const timeout = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error("Claude CLI timed out after 180s"));
    }, 180000);
  });
}

function callCodex(
  prompt: string,
  cwd: string,
  model: string,
  onEvent?: (event: StreamEvent) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const parser = onEvent ? new CodexStreamParser("architect") : null;
    parser?.on("event", (event: StreamEvent) => onEvent!(event));

    const proc = spawn(CODEX_BIN, ["exec", "--json", "--cd", cwd, "--model", model, prompt], {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let output = "";

    proc.stdout?.on("data", (data: Buffer) => {
      const text = data.toString();
      output += text;
      parser?.feed(text);
    });

    proc.stderr?.on("data", () => {
      // Codex may emit progress information to stderr.
    });

    proc.on("error", (error) => {
      reject(new Error(`Failed to spawn Codex CLI: ${error.message}`));
    });

    proc.on("exit", (code) => {
      clearTimeout(timeout);
      parser?.flush();

      const resultText = extractCodexResult(output);
      if (code === 0 && resultText) {
        resolve(resultText);
        return;
      }

      reject(new Error(`Codex CLI exited with code ${code}`));
    });

    const timeout = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error("Codex CLI timed out after 180s"));
    }, 180000);
  });
}

function extractCodexResult(output: string): string | null {
  const events = output.split("\n").filter((line) => line.trim());
  let resultText: string | null = null;

  for (const line of events) {
    try {
      const event = JSON.parse(line) as {
        type?: string;
        item?: { type?: string; text?: string };
      };
      if (event.type === "item.completed" && event.item?.type === "agent_message" && event.item.text) {
        resultText = event.item.text;
      }
    } catch {
      // Ignore malformed stream events and let the CLI exit status report failure.
    }
  }

  return resultText;
}

export function parsePlan(raw: unknown, _project?: ProjectStructure): MissionPlan {
  const candidate = raw as { tasks?: unknown };
  if (!Array.isArray(candidate.tasks) || candidate.tasks.length === 0) {
    throw new Error("Planner response must include at least one task");
  }
  const tasks: PlannedTask[] = candidate.tasks.map((value) => {
    const task = value as Record<string, unknown>;
    const complexity = String(task.complexity);
    if (!["low", "medium", "high"].includes(complexity)) throw new Error(`Invalid task complexity: ${complexity}`);
    if (!Array.isArray(task.acceptanceCriteria) || task.acceptanceCriteria.length === 0) throw new Error(`Task ${String(task.id)} needs acceptance criteria`);
    const prompt = typeof task.prompt === "string" ? task.prompt : "";
    if (!prompt.trim()) throw new Error(`Task ${String(task.id)} needs a Markdown prompt`);
    return {
      id: String(task.id || "").trim(),
      title: String(task.title || "").trim(),
      prompt,
      workdir: String(task.workdir || ".").trim() || ".",
      dependsOn: Array.isArray(task.dependsOn) ? task.dependsOn.map(String) : [],
      complexity: complexity as PlannedTask["complexity"],
      acceptanceCriteria: task.acceptanceCriteria.map(String).map((criterion) => criterion.trim()).filter(Boolean),
      model: typeof task.model === "string" && task.model.trim() ? task.model.trim() : undefined,
    };
  });
  validateTaskGraph(tasks);
  return { tasks };
}

export function validateTaskGraph(tasks: PlannedTask[]): void {
  const ids = new Set<string>();
  for (const task of tasks) {
    if (!task.id || !task.title) throw new Error("Every task needs an id and title");
    if (ids.has(task.id)) throw new Error(`Duplicate task id: ${task.id}`);
    ids.add(task.id);
  }
  for (const task of tasks) {
    for (const dependency of task.dependsOn) {
      if (!ids.has(dependency)) throw new Error(`Task ${task.id} depends on unknown task: ${dependency}`);
      if (dependency === task.id) throw new Error(`Task ${task.id} cannot depend on itself`);
    }
  }
  const visiting = new Set<string>();
  const complete = new Set<string>();
  const visit = (id: string): void => {
    if (complete.has(id)) return;
    if (visiting.has(id)) throw new Error(`Dependency cycle detected at task: ${id}`);
    visiting.add(id);
    const task = tasks.find((entry) => entry.id === id)!;
    task.dependsOn.forEach(visit);
    visiting.delete(id);
    complete.add(id);
  };
  tasks.forEach((task) => visit(task.id));
}
