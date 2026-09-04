/**
 * Runs non-interactive Codex sessions and streams their JSONL events.
 */

import { EventEmitter } from "events";
import { execFileSync, spawn, type ChildProcess } from "child_process";
import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import type { AgentAdapter, AdapterEvents } from "../adapter-interface.js";
import { CodexStreamParser } from "./codex-stream-parser.js";
import type { CompleteEvent, SpawnAgentConfig, StreamEvent } from "../types.js";

const CLAUDE_MODEL_ALIASES = new Set(["haiku", "sonnet", "opus"]);

function resolveCodexPath(): string {
  const candidates = [
    join(homedir(), ".local", "bin", "codex"),
    "/usr/local/bin/codex",
  ];
  const installed = candidates.find((candidate) => existsSync(candidate));
  if (installed) return installed;

  try {
    return execFileSync("which", ["codex"], { encoding: "utf8" }).trim();
  } catch {
    return "codex";
  }
}

export class CodexAdapter extends EventEmitter implements AgentAdapter {
  private process: ChildProcess | null = null;
  private parser: CodexStreamParser | null = null;
  private pid: number | null = null;
  private sessionId: string | null = null;

  constructor(private readonly agentId: string) {
    super();
  }

  spawn(config: SpawnAgentConfig): number {
    if (this.process) throw new Error("Process already running");

    this.parser = new CodexStreamParser(this.agentId);
    this.parser.on("event", (event: StreamEvent) => this.handleEvent(event));

    this.process = spawn(resolveCodexPath(), this.buildArgs(config), {
      cwd: config.workspace || process.cwd(),
      env: this.buildEnvironment(config),
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.pid = this.process.pid || null;

    this.process.stdout?.on("data", (data: Buffer) => this.parser?.feed(data.toString()));
    this.process.stderr?.on("data", (data: Buffer) => {
      const message = data.toString().trim();
      if (message) this.emit("error", new Error(message));
    });
    this.process.on("error", (error) => {
      this.emit("error", error);
      this.cleanup();
    });
    this.process.on("exit", (code) => this.handleExit(code));

    if (!this.pid) throw new Error("Codex did not return a process ID");
    return this.pid;
  }

  write(_text: string): void {
    throw new Error("Codex exec sessions are non-interactive; start a new task instead");
  }

  interrupt(): void {
    this.process?.kill("SIGINT");
  }

  kill(): void {
    this.process?.kill("SIGKILL");
    this.cleanup();
  }

  dispose(): void {
    this.kill();
    this.removeAllListeners();
  }

  isRunning(): boolean {
    return this.process !== null;
  }

  getPid(): number | null {
    return this.pid;
  }

  getSessionId(): string | null {
    return this.sessionId || this.parser?.getSessionId() || null;
  }

  private buildArgs(config: SpawnAgentConfig): string[] {
    const sandbox = process.env.DECK_CODEX_SANDBOX || "danger-full-access";
    const args = [
      "exec",
      "--json",
      "--skip-git-repo-check",
      "--cd", config.workspace || process.cwd(),
      "--sandbox", sandbox,
    ];

    // Codex exec does not allow --approve-for-me with an explicit sandbox.
    // The unrestricted sandbox lets non-interactive task agents install and
    // resolve dependencies without waiting for an unavailable approval prompt.

    if (config.model && !CLAUDE_MODEL_ALIASES.has(config.model)) {
      args.push("--model", config.model);
    }

    if (config.resumeSessionId) {
      args.push("resume", config.resumeSessionId);
    }

    args.push(config.prompt);
    return args;
  }

  private buildEnvironment(config: SpawnAgentConfig): NodeJS.ProcessEnv {
    const workspace = config.workspace || process.cwd();
    return {
      ...process.env,
      ...config.env,
      UV_CACHE_DIR: config.env?.UV_CACHE_DIR || join(workspace, ".commander-graf", "uv-cache"),
    };
  }

  private handleEvent(event: StreamEvent): void {
    if (event.type === "init") {
      this.sessionId = (event.data as { sessionId: string }).sessionId;
    }
    if (event.type === "complete") {
      this.emit("complete", event.data as CompleteEvent["data"]);
    }
    this.emit("stream", event);
  }

  private handleExit(code: number | null): void {
    this.parser?.flush();
    if (!this.parser?.hasCompleted()) {
      this.emit("complete", {
        status: code === 0 ? "success" : "error",
        error: code === 0 ? undefined : `Codex exited with code ${code}`,
        sessionId: this.getSessionId() || undefined,
      });
    }
    this.cleanup();
  }

  private cleanup(): void {
    this.process = null;
    this.pid = null;
    this.parser?.removeAllListeners();
    this.parser = null;
  }
}

// Type-safe emitter
export interface CodexAdapter {
  on<K extends keyof AdapterEvents>(
    event: K,
    listener: (...args: AdapterEvents[K]) => void
  ): this;
  emit<K extends keyof AdapterEvents>(
    event: K,
    ...args: AdapterEvents[K]
  ): boolean;
}
