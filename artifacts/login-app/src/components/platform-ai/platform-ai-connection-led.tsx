import { cn } from "@/lib/utils";

export type PlatformAiConnectionState = "connected" | "disconnected" | "checking";

type PlatformAiConnectionLedProps = {
  state: PlatformAiConnectionState;
  connectedLabel: string;
  disconnectedLabel: string;
  checkingLabel: string;
  className?: string;
};

/** LED-style binding status: green connected / red disconnected. */
export function PlatformAiConnectionLed({
  state,
  connectedLabel,
  disconnectedLabel,
  checkingLabel,
  className,
}: PlatformAiConnectionLedProps) {
  const label =
    state === "connected"
      ? connectedLabel
      : state === "disconnected"
        ? disconnectedLabel
        : checkingLabel;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium",
        state === "connected" && "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        state === "disconnected" && "border-rose-500/35 bg-rose-500/10 text-rose-700 dark:text-rose-300",
        state === "checking" && "border-border bg-muted/40 text-muted-foreground",
        className,
      )}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <span className="relative flex size-2.5 shrink-0">
        {state !== "checking" ? (
          <span
            className={cn(
              "absolute inline-flex size-full animate-ping rounded-full opacity-60",
              state === "connected" ? "bg-emerald-500" : "bg-rose-500",
            )}
            aria-hidden
          />
        ) : null}
        <span
          className={cn(
            "relative inline-flex size-2.5 rounded-full",
            state === "connected" && "bg-emerald-500",
            state === "disconnected" && "bg-rose-500",
            state === "checking" && "bg-muted-foreground/50",
          )}
          aria-hidden
        />
      </span>
      <span>{label}</span>
    </div>
  );
}
