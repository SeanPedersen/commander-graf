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
2. For bounded evidence gathering, use the configured cheap exploration model "${explorerModel}" for narrowly scoped questions. When delegating, use Codex collaboration tools rather than launching a nested CLI process. Limit exploration to four questions, and use no more than one additional follow-up round.
3. Design an executable task graph from that evidence, optimizing for wall-clock time (maximum parallel width, minimum chain depth):
   - Make each task atomic: one clear, independently reviewable outcome with no overlapping ownership.
   - Keep prompts concrete, scoped to the relevant files or symbols, and include verifiable acceptance criteria.
   - Prefer parallel root tasks. Add a dependency only when a task needs another task's completed, on-disk output to run — never for a task that merely calls into an API another task defines.
   - Exception for new-project work: when the request requires creating project metadata, dependency management, or a package/application skeleton, create one dedicated bootstrap task as the sole root. Every implementation, test, UI, or integration task that relies on that foundation must depend on the bootstrap task. The bootstrap task owns the shared setup files exclusively; do not let sibling tasks recreate or modify them.
   - Break chains formed by shared APIs: when task B would only depend on task A because B calls functions/types A defines (e.g. a UI consuming a rules engine, a client consuming a schema), fix that API's exact shape (signatures, types, module layout, file paths) once, then paste that identical spec verbatim into the prompt of every sibling task that builds against it — including A's own prompt. Siblings run in parallel with no visibility into each other's work, so a spec only one of them sees is a spec the others will silently diverge from.
   - Make each sibling independently verifiable against the shared spec, not just at final integration: its acceptance criteria must let it be checked in isolation (e.g. unit tests against the documented interface, or a minimal stub/fake implementing the contract if the real dependency isn't done yet), so a mismatch surfaces in that task's own review instead of only at the end.
   - Converge fan-outs with one final integration task: once several sibling tasks are each built against a shared contract, add a single lightweight final task that depends on all of them, wires the real pieces together, and runs an end-to-end acceptance check — instead of making one of the siblings depend on all the others.
   - Never add cosmetic ordering or cycles.
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

/** Forces a validated StructuredOutput tool call (see callClaude) instead of
 *  free-text JSON — necessary because task prompts routinely embed their own
 *  ```-fenced code samples (e.g. a shared API spec pasted verbatim per
 *  sibling task per the planner's fan-out rules), which any fence-matching
 *  heuristic over free text risks mistaking for the real delimiter. */
const JSON_SCHEMA_TASK_GRAPH = {
  type: "object",
  additionalProperties: false,
  properties: {
    tasks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          prompt: { type: "string" },
          workdir: { type: "string" },
          dependsOn: { type: "array", items: { type: "string" } },
          complexity: { type: "string", enum: ["low", "medium", "high"] },
          acceptanceCriteria: { type: "array", items: { type: "string" } },
        },
        required: ["id", "title", "prompt", "workdir", "dependsOn", "complexity", "acceptanceCriteria"],
      },
    },
  },
  required: ["tasks"],
};

/** Scans for the first top-level JSON object, tracking brace depth while
 *  skipping over string contents (so embedded braces/backticks inside a
 *  string value — e.g. a task prompt quoting its own ```-fenced API spec —
 *  can never be mistaken for structural characters). */
function extractJsonObject(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*)```/);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf("{");
  if (start === -1) return candidate;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < candidate.length; i++) {
    const ch = candidate[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return candidate.slice(start, i + 1);
  }
  return candidate.slice(start);
}

export function parseJson(text: string, label: string): any {
  const trimmed = text.trim();
  // --json-schema's structured_output is stringified as-is and is already
  // valid JSON — it must never be run through fence/brace extraction below,
  // since a literal ``` inside one of its own string fields (a task prompt
  // quoting its shared API spec) would otherwise be mistaken for a real
  // fence and corrupt perfectly valid input.
  try {
    return JSON.parse(trimmed);
  } catch {
    // Not directly parseable — likely free text wrapping the JSON (a plain
    // text response, or a fallback runtime without schema-forced output).
  }
  try {
    return JSON.parse(extractJsonObject(trimmed));
  } catch (error) {
    throw new Error(`Failed to parse ${label} response: ${(error as Error).message}`);
  }
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
      "--json-schema",
      JSON.stringify(JSON_SCHEMA_TASK_GRAPH),
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
          // --json-schema forces a validated StructuredOutput tool call —
          // this is already schema-conformant JSON, so it takes priority
          // over the raw result/text-block fallbacks below (which are prone
          // to truncating on markdown fences nested inside task prompts).
          if (event.structured_output !== undefined) {
            resultText = JSON.stringify(event.structured_output);
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

    // Planning involves real tool calls (Read/Grep/Glob) plus extended
    // thinking, not just a single completion — a real run against this
    // prompt measured ~162s of API time with 10k+ thinking tokens, so a
    // 180s cap leaves too little margin before a slower run gets SIGKILLed
    // mid-plan with no error surfaced.
    const timeout = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error("Claude CLI timed out after 300s"));
    }, 300000);
  });
}

/** Codex takes its schema as a file path rather than inline JSON (unlike
 *  Claude's --json-schema) — write it once per call into a scratch dir and
 *  remove that dir once the process is done with it, on every exit path. */
function writeTaskGraphSchemaFile(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "commander-graf-schema-"));
  const file = path.join(dir, "task-graph.schema.json");
  fs.writeFileSync(file, JSON.stringify(JSON_SCHEMA_TASK_GRAPH));
  return file;
}

function cleanupSchemaFile(file: string): void {
  try { fs.rmSync(path.dirname(file), { recursive: true, force: true }); } catch {}
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

    const schemaFile = writeTaskGraphSchemaFile();

    const proc = spawn(
      CODEX_BIN,
      ["exec", "--json", "--enable", "multi_agent", "--skip-git-repo-check", "--cd", cwd, "--model", model, "--output-schema", schemaFile, prompt],
      {
        cwd,
        env: {
          ...process.env,
          CODEX_HOME: process.env.CODEX_HOME || path.join(os.homedir(), ".codex"),
        },
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

    let output = "";
    let stderr = "";

    proc.stdout?.on("data", (data: Buffer) => {
      const text = data.toString();
      output += text;
      parser?.feed(text);
    });

    proc.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on("error", (error) => {
      cleanupSchemaFile(schemaFile);
      reject(new Error(`Failed to spawn Codex CLI: ${error.message}`));
    });

    proc.on("exit", (code) => {
      clearTimeout(timeout);
      parser?.flush();
      cleanupSchemaFile(schemaFile);

      const resultText = extractCodexResult(output);
      if (code === 0 && resultText) {
        resolve(resultText);
        return;
      }

      const error = extractCodexError(output) || stderr.trim();
      reject(new Error(error
        ? `Codex CLI failed: ${error}`
        : `Codex CLI exited with code ${code}`));
    });

    const timeout = setTimeout(() => {
      proc.kill("SIGKILL");
      cleanupSchemaFile(schemaFile);
      reject(new Error("Codex CLI timed out after 300s"));
    }, 300000);
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

function extractCodexError(output: string): string | null {
  for (const line of output.split("\n").filter((entry) => entry.trim())) {
    try {
      const event = JSON.parse(line) as {
        type?: string;
        error?: string | { message?: string };
        message?: string;
      };
      if (event.type !== "error" && event.type !== "turn.failed") continue;

      const error = typeof event.error === "string"
        ? event.error
        : event.error?.message;
      return error || event.message || null;
    } catch {
      // A malformed JSONL line cannot provide a reliable Codex error detail.
    }
  }

  return null;
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
