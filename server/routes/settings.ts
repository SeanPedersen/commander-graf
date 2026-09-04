/**
 * Settings Routes - Config resolution and MCP server discovery.
 */

import { Router } from "express";
import fs from "fs";
import path from "path";
import type { DeckStore } from "../core/db.js";
import { resolveSettings } from "../core/config-resolver.js";
import { DEFAULT_SETTINGS } from "../core/types.js";
import type { DeckSettings } from "../core/types.js";
import { detectedRuntimes } from "../deck/runtime-registry.js";

function mergeSettings(store: DeckStore): DeckSettings {
  const merged: DeckSettings = { ...resolveSettings() };
  for (const [key, value] of Object.entries(store.getAllSettings())) {
    if (!(key in merged)) continue;
    const defaultVal = (DEFAULT_SETTINGS as Record<string, unknown>)[key];
    if (Array.isArray(defaultVal)) {
      try { (merged as unknown as Record<string, unknown>)[key] = JSON.parse(value); } catch { /* Ignore malformed legacy values. */ }
    } else if (typeof defaultVal === "number") {
      (merged as unknown as Record<string, unknown>)[key] = parseFloat(value);
    } else if (typeof defaultVal === "boolean") {
      (merged as unknown as Record<string, unknown>)[key] = value === "true" || value === "1";
    } else {
      (merged as unknown as Record<string, unknown>)[key] = value;
    }
  }

  const detected = new Set(detectedRuntimes.filter((runtime) => runtime.detected).map((runtime) => runtime.id));
  merged.activeRuntimes = merged.activeRuntimes.filter((runtime) => detected.has(runtime));
  return merged;
}

export function createSettingsRouter(store: DeckStore): Router {
  const router = Router();

  /** Get all settings (merged from DB + defaults) */
  router.get("/", (_req, res) => {
    try {
      res.json({ ...mergeSettings(store), runtimes: detectedRuntimes });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /** Update settings */
  router.put("/", (req, res) => {
    try {
      const updates = req.body;
      if (!updates || typeof updates !== "object") {
        return res.status(400).json({ error: "Request body must be an object" });
      }

      // Only allow known setting keys
      const allowedKeys = Object.keys(DEFAULT_SETTINGS);
      for (const [key, value] of Object.entries(updates)) {
        if (!allowedKeys.includes(key)) continue;
        store.setSetting(key, Array.isArray(value) ? JSON.stringify(value) : String(value));
      }

      res.json({ ...mergeSettings(store), runtimes: detectedRuntimes });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /** List detected MCP servers */
  router.get("/mcp-servers", (req, res) => {
    try {
      const projectRoot = (req.query.path as string) || process.cwd();
      const mcpJsonPath = path.join(projectRoot, ".mcp.json");

      if (!fs.existsSync(mcpJsonPath)) {
        return res.json({ servers: [] });
      }

      const mcpConfig = JSON.parse(fs.readFileSync(mcpJsonPath, "utf-8"));
      const servers = Object.entries(mcpConfig.mcpServers || {}).map(
        ([name, config]: [string, any]) => ({
          name,
          command: config.command,
          args: config.args,
          env: config.env ? Object.keys(config.env) : [],
        })
      );

      res.json({ servers, path: mcpJsonPath });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
