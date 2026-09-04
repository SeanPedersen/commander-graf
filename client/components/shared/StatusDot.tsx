/** Status indicator shared by task and workflow UI. */

export function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: "bg-deck-muted",
    queued: "bg-deck-warning",
    running: "bg-deck-success",
    idle: "bg-deck-warning",
    paused: "bg-deck-info",
    completed: "bg-deck-accent",
    success: "bg-deck-success",
    failed: "bg-deck-error",
    finalizing: "bg-deck-warning",
    cancelled: "bg-deck-muted",
    dead: "bg-deck-error",
    skipped: "bg-deck-muted",
  };

  if (status === "running") {
    return (
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-deck-success opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-deck-success" />
      </span>
    );
  }

  if (status === "success") {
    return (
      <span
        className="inline-flex h-3.5 w-3.5 items-center justify-center text-deck-success"
        aria-label="Completed successfully"
        role="img"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true" className="h-full w-full fill-none stroke-current stroke-[2.5]">
          <path d="m3 8 3.1 3.1L13 4.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex rounded-full h-2 w-2 ${colors[status] || "bg-deck-muted"}`}
    />
  );
}
