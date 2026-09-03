/**
 * Architect Agent - AI-powered task decomposition.
 *
 * Takes a task description + ProjectStructure → calls Claude CLI → returns MissionPlan.
 * Uses `claude --print` so no API key needed — leverages user's existing Claude auth.
 */

import { spawn, execSync } from "child_process";
import os from "os";
import path from "path";
import fs from "fs";
import { StreamParser } from "./stream-parser.js";
import type {
  ProjectStructure,
  MissionPlan,
  PlannedAgent,
  StreamEvent,
  PromptEvent,
} from "./types.js";
import type { RuntimeType } from "../core/types.js";

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

/** Generate a mission plan from a task description and project structure */
export async function planMission(
  task: string,
  project: ProjectStructure,
  onEvent?: (event: StreamEvent) => void
): Promise<MissionPlan> {
  const prompt = buildPrompt(task, project);

  // Not part of the CLI's own stream — the UI wants to show what the
  // architect was actually asked, same as any other agent's Config tab.
  onEvent?.({
    type: "prompt",
    agentId: "architect",
    timestamp: new Date().toISOString(),
    data: { content: prompt },
  } as PromptEvent);

  const resultText = await callClaude(prompt, project.root, onEvent);

  return parsePlan(resultText, project);
}

function configuredRuntime(): RuntimeType {
  const configured = process.env.DECK_DEFAULT_RUNTIME;
  return configured === "codex" || configured === "gemini-cli" || configured === "litellm"
    ? configured
    : "claude-code";
}

function buildPrompt(task: string, project: ProjectStructure): string {
  const runtime = configuredRuntime();
  const modelGuidance = runtime === "codex"
    ? "Use the configured Codex default model unless a task explicitly needs a model identifier supplied by the operator."
    : "Use \"sonnet\" as default model. Use \"opus\" only for complex architectural decisions or critical reviews. Use \"haiku\" for simple searches, linting, or formatting tasks.";
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

  return `You are an AI architect that decomposes software tasks into a multi-agent execution plan.

## Project Context
${projectCtx}

## Task
${task}

## Instructions
Before proposing a plan, investigate the codebase with your tools (Read, Grep, Glob) —
look at the actual files the task will touch, existing conventions, and any related code.
Briefly narrate what you're checking and why as you go; keep it short (a sentence or two
per step), this isn't a full code review. This isn't optional busywork — it's how you make
the plan concrete and correctly scoped instead of guessing from the project summary alone.

Then decompose the task into 2-6 specialized agents. Each agent should have a focused,
independent task. Consider dependencies between agents — agents that produce outputs needed
by others should be listed in dependsOn.

Finish with ONLY a JSON object as your last message (no markdown fence needed, no
explanation after it) with this exact schema:
{
  "agents": [
    {
      "name": "agent-name",
      "task": "Detailed task description for the agent",
      "role": "researcher|implementer|tester|reviewer|devops",
      "workdir": ".",
      "model": "sonnet",
      "runtime": "${runtime}",
      "dependsOn": []
    }
  ],
  "estimatedCost": 0.15,
  "estimatedTimeMinutes": 5
}

Rules:
- Set runtime to "${runtime}" for every agent.
- ${modelGuidance}
- workdir should be relative to project root (use "." for root).
- For monorepos, assign agents to specific package directories when possible.
- dependsOn contains agent names that must complete before this agent starts.
- estimatedCost in USD, estimatedTimeMinutes is wall-clock time (agents run in parallel where possible).
- Agent names should be short, kebab-case identifiers (e.g., "auth-impl", "api-tests").
- Do NOT create agents for git commit, push, or finalize operations -- those are handled separately by the system.`;
}

function callClaude(
  prompt: string,
  cwd: string,
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
      "sonnet",
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

function parsePlan(text: string, project: ProjectStructure): MissionPlan {
  const defaultRuntime = configuredRuntime();
  // Extract JSON from response (handle markdown code blocks)
  let jsonStr = text.trim();
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }

  // Try to find JSON object
  const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    jsonStr = jsonMatch[0];
  }

  try {
    const raw = JSON.parse(jsonStr);

    const agents: PlannedAgent[] = (raw.agents || []).map((a: any) => ({
      name: String(a.name || "agent"),
      task: String(a.task || ""),
      role: a.role || undefined,
      workdir: String(a.workdir || "."),
      model: a.model ? String(a.model) : undefined,
      runtime: a.runtime === "codex" || a.runtime === "gemini-cli" || a.runtime === "litellm"
        ? a.runtime
        : defaultRuntime,
      dependsOn: Array.isArray(a.dependsOn) ? a.dependsOn.map(String) : [],
    }));

    // Validate: all dependsOn references must exist
    const names = new Set(agents.map((a) => a.name));
    for (const agent of agents) {
      agent.dependsOn = agent.dependsOn.filter((dep) => names.has(dep));
    }

    return {
      agents,
      estimatedCost: Number(raw.estimatedCost) || 0,
      estimatedTimeMinutes: Number(raw.estimatedTimeMinutes) || 5,
    };
  } catch (err) {
    throw new Error(`Failed to parse architect response as JSON: ${(err as Error).message}`);
  }
}
