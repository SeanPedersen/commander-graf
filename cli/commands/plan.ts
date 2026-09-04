/**
 * commander-graf plan <task> — Plan a mission (AI decomposition)
 *
 * Saves plan to ~/.commander-graf/last-plan.json for `commander-graf launch`.
 */

import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { CliContext } from "../index.js";
import { formatPlan, header, success, info, dim } from "../formatter.js";

const PLAN_DIR = join(homedir(), ".commander-graf");
const PLAN_FILE = join(PLAN_DIR, "last-plan.json");

export async function execute({ client, args, flags }: CliContext): Promise<void> {
  const task = args.join(" ");
  if (!task) {
    throw new Error("Usage: commander-graf plan <task description>");
  }

  if (!flags.json) {
    console.log(info(`Planning: ${task}`));
  }

  const body: Record<string, string> = { task };
  if (flags.workspace) {
    body.workspaceId = flags.workspace;
  }

  const result = await client.post<{ plan: any; project: any }>("/api/deck/mission/plan", body);
  const { plan, project } = result;

  // Save plan to disk
  mkdirSync(PLAN_DIR, { recursive: true });
  writeFileSync(PLAN_FILE, JSON.stringify({ plan, project, task }, null, 2));

  if (flags.json) {
    console.log(JSON.stringify(result));
    return;
  }

  console.log(header("Mission Plan"));
  console.log(formatPlan(plan, project));
  console.log(`\n${success(`Plan saved to ${dim(PLAN_FILE)}`)}`);
  console.log(`${dim("  Launch with: commander-graf launch")}`);
}

export { PLAN_FILE };
