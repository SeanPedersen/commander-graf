/**
 * Commander Graf - Electron Preload Script
 *
 * Runs in renderer context with Node.js access.
 * Exposes safe APIs via contextBridge.
 */

import { contextBridge } from "electron";

// Expose minimal platform info to renderer
contextBridge.exposeInMainWorld("commanderGraf", {
  platform: process.platform,
  isElectron: true,
});
