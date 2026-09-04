/**
 * Runs non-interactive OpenCode sessions and streams their JSON events.
 */

import { EventEmitter } from "events";
import { execFileSync, spawn, type ChildProcess } from "child_process";
import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import type { AgentAdapter, AdapterEvents } from "../adapter-interface.js";
import { OpenCodeStreamParser } from "./opencode-stream-parser.js";
import type { CompleteEvent, SpawnAgentConfig, StreamEvent } from "../types.js";

function resolveOpenCodePath(): string {
  const candidates = [
    join(homedir(), ".local", "bin", "opencode"),
    "/usr/local/bin/opencode",
    "/usr/bin/opencode",
  ];
  const installed = candidates.find((candidate) => existsSync(candidate));
  if (installed) return installed;

  try {
    return execFileSync("which", ["opencode"], { encoding: "utf8" }).trim();
  } catch {
    return "opencode";
  }
}

export class OpenCodeAdapter extends EventEmitter implements AgentAdapter {
  private process: ChildProcess | null = null;
  private parser: OpenCodeStreamParser | null = null;
  private pid: number | null = null;
  private sessionId: string | null = null;

  constructor(private readonly agentId: string) {
    super();
  }

  spawn(config: SpawnAgentConfig): number {
    if (this.process) throw new Error("Process already running");

    this.parser = new OpenCodeStreamParser(this.agentId);
    this.parser.on("event", (event: StreamEvent) => this.handleEvent(event));

    this.process = spawn(resolveOpenCodePath(), this.buildArgs(config), {
      cwd: config.workspace || process.cwd(),
      env: process.env,
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

    if (!this.pid) throw new Error("OpenCode did not return a process ID");
    return this.pid;
  }

  write(_text: string): void {
    throw new Error("OpenCode run sessions are non-interactive; start a new task instead");
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
    const args = ["run", "--format", "json"];

    if (config.workspace) {
      args.push("--dir", config.workspace);
    }
    if (config.model) {
      args.push("--model", config.model);
    }
    if (config.resumeSessionId) {
      args.push("--session", config.resumeSessionId);
    }

    args.push(config.prompt);
    return args;
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
      const usage = this.parser?.getUsage();
      this.emit("complete", {
        status: code === 0 ? "success" : "error",
        error: code === 0 ? undefined : `OpenCode exited with code ${code}`,
        sessionId: this.getSessionId() || undefined,
        inputTokens: usage?.inputTokens || undefined,
        outputTokens: usage?.outputTokens || undefined,
        costUsd: usage?.costUsd || undefined,
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
export interface OpenCodeAdapter {
  on<K extends keyof AdapterEvents>(
    event: K,
    listener: (...args: AdapterEvents[K]) => void
  ): this;
  emit<K extends keyof AdapterEvents>(
    event: K,
    ...args: AdapterEvents[K]
  ): boolean;
}
