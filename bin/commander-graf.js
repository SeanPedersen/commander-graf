#!/usr/bin/env node

/**
 * Commander Graf CLI
 *
 * Usage:
 *   commander-graf                    Start server (default)
 *   commander-graf serve              Start server (explicit)
 *   commander-graf run <task>         Plan + Launch + Monitor + Finalize
 *   commander-graf plan <task>        Plan a mission
 *   commander-graf status             Show active workflow
 *   commander-graf --help             Show all commands
 */

import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { spawn } from "child_process";
import { existsSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const args = process.argv.slice(2);

// ─── Version ──────────────────────────────────────

if (args.includes("--version")) {
  const pkg = await import("../package.json", { with: { type: "json" } });
  console.log(`commander-graf v${pkg.default.version}`);
  process.exit(0);
}

// ─── Determine if this is a CLI command or server start ───

const CLI_COMMANDS = [
  "status", "agents", "history", "config", "plan", "launch",
  "abort", "run", "workspace", "finalize", "commit", "log",
];

const firstArg = args[0];
const isCliCommand = firstArg && CLI_COMMANDS.includes(firstArg);

// ─── Resolve execution path ──────────────────────
// Prefer pre-built bundle (dist-cli/entry.js) for CLI, fall back to tsx + source.
// Server always uses tsx since it has native deps (better-sqlite3) that can't be bundled.

function resolveCliEntry() {
  const built = join(__dirname, "../dist-cli/entry.js");
  if (existsSync(built)) {
    return { bin: process.execPath, args: [built] };
  }
  return { bin: "npx", args: ["tsx", join(__dirname, "../cli/entry.ts")] };
}

function resolveServerEntry() {
  return { bin: "npx", args: ["tsx", join(__dirname, "../server/index.ts")] };
}

if (isCliCommand) {
  // ─── CLI Mode ───────────────────────────────────
  const entry = resolveCliEntry();
  const child = spawn(entry.bin, entry.args, {
    stdio: "inherit",
    env: {
      ...process.env,
      COMMANDER_GRAF_CLI_ARGS: JSON.stringify(args),
    },
    shell: false,
  });

  child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 0)));

  for (const sig of ["SIGINT", "SIGTERM"]) {
    process.on(sig, () => child.kill(sig));
  }
} else {
  // ─── Server Mode ────────────────────────────────

  // Help
  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
Commander Graf - Web-Based Agent Command Center

Usage:
  commander-graf [command] [options]

Server:
  commander-graf                    Start server on default port (3002)
  commander-graf serve [--port N]   Start server on specified port

CLI Commands:
  run <task> [--commit] [--pr]  Plan + Launch + Monitor + Deliver
  plan <task>                   Plan a mission (AI decomposition)
  launch                        Execute the last plan
  status                        Show active workflow status
  abort                         Abort active workflow
  agents                        List all agents
  log <agent-name>              View agent output
  workspace list|add|remove     Manage workspaces
  finalize                      View changes and commit
  commit -m "msg" [--push]      Non-interactive commit
  history                       Workflow history
  config [set key val]          View or update settings

Global Options:
  --json                        Machine-readable JSON output
  --port <n>                    Server port (default: auto-detect)
  --workspace <id>              Workspace ID to use
  --help, -h                    Show this help
  --version                     Show version

Environment Variables:
  PORT                          Server port (default: 3002)
  DECK_MAX_AGENTS               Max concurrent agents (default: 10)
  DECK_IDLE_THRESHOLD_SECONDS   Idle detection threshold (default: 300)
  LITELLM_PROXY_URL             LiteLLM proxy URL
  AGENT_STATE_DB                Path to agent-state.db
`);
    process.exit(0);
  }

  // Parse --port flag
  const portIdx = args.indexOf("--port");
  if (portIdx !== -1 && args[portIdx + 1]) {
    process.env.PORT = args[portIdx + 1];
  }

  // Run the server via tsx
  const entry = resolveServerEntry();
  const child = spawn(entry.bin, entry.args, {
    stdio: "inherit",
    env: { ...process.env },
    shell: false,
  });

  child.on("exit", (code, signal) => {
    process.exit(signal ? 1 : (code ?? 0));
  });

  // Forward signals
  for (const sig of ["SIGINT", "SIGTERM"]) {
    process.on(sig, () => {
      child.kill(sig);
    });
  }
}
