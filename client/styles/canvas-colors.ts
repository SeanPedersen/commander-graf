/**
 * Color tokens for the React Flow canvases.
 *
 * React Flow takes plain color strings in JS (edge strokes, arrowhead markers,
 * the background dot pattern) and renders several of them as SVG presentation
 * attributes, where `var(--…)` does not resolve. These values therefore mirror
 * the `--deck-canvas-*` / status variables in globals.css and must be kept in
 * sync with them.
 */

import type { Theme } from "../stores/deck-store";

export interface CanvasColors {
  dot: string;
  edge: string;
  edgeRunning: string;
}

const CANVAS_COLORS: Record<Theme, CanvasColors> = {
  dark: {
    dot: "#1a1a25",
    edge: "#3a3a4a",
    edgeRunning: "#22c55e",
  },
  light: {
    dot: "#cdcdda",
    edge: "#a8a8ba",
    edgeRunning: "#15803d",
  },
};

export const canvasColors = (theme: Theme): CanvasColors => CANVAS_COLORS[theme];
