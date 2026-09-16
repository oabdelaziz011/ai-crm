/** Visual class for ticket status badges (presentation only). */
export function ticketStatusBadgeClassName(status: string): string | undefined {
  if (status === "in_progress") {
    // Warm amber — distinct from Open (primary), Resolved/Closed (secondary), SLA tones.
    return "border-transparent bg-amber-500/15 text-amber-800 shadow-xs dark:bg-amber-500/20 dark:text-amber-200";
  }
  return undefined;
}
