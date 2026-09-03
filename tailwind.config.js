/** @type {import('tailwindcss').Config} */

/**
 * Every deck color resolves through a CSS custom property so that flipping
 * `data-theme` on <html> repaints the whole UI (see client/styles/globals.css).
 * The variables hold space-separated RGB channels rather than hex so Tailwind's
 * opacity modifiers (`bg-deck-accent/30`) keep working.
 */
const deckColor = (name) => `rgb(var(--deck-${name}) / <alpha-value>)`;

const DECK_TOKENS = [
  "bg",
  "surface",
  "surface-2",
  "surface-3",
  "border",
  "border-light",
  "accent",
  "accent-hover",
  "accent-dim",
  "success",
  "success-hover",
  "warning",
  "error",
  "muted",
  "text",
  "text-dim",
  "text-bright",
  "scrim",
  // Semantic accents used by event streams and diffs
  "info",
  "thinking",
  "diff-add",
  "diff-del",
  "diff-hunk",
  // Agent role badges
  "role-researcher",
  "role-implementer",
  "role-tester",
  "role-reviewer",
  "role-devops",
];

export default {
  content: ["./client/**/*.{tsx,ts,jsx,js}"],
  theme: {
    extend: {
      colors: {
        deck: Object.fromEntries(
          DECK_TOKENS.map((token) => [token, deckColor(token)])
        ),
      },
      fontFamily: {
        sans: ["'DM Sans'", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
    },
  },
  plugins: [],
};
