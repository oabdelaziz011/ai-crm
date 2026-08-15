import { Badge } from "@/components/ui/badge";
import type { TicketSlaState } from "@/lib/tickets/ticket-inbox-metrics";
import { cn } from "@/lib/utils";

export function TicketStatusBadge({
  status,
  label,
}: {
  status: string;
  label: string;
}) {
  const variant =
    status === "closed" || status === "resolved"
      ? "secondary"
      : status === "waiting_customer"
        ? "outline"
        : "default";
  return <Badge variant={variant}>{label}</Badge>;
}

export function TicketPriorityBadge({
  priority,
  label,
}: {
  priority: string;
  label: string;
}) {
  const variant =
    priority === "urgent" ? "destructive" : priority === "high" ? "default" : priority === "low" ? "outline" : "secondary";
  return <Badge variant={variant}>{label}</Badge>;
}

export function TicketSlaBadge({
  state,
  label,
}: {
  state: TicketSlaState;
  label: string;
}) {
  if (state === "none") {
    return <Badge variant="outline">{label}</Badge>;
  }
  return (
    <Badge
      variant="outline"
      className={cn(
        state === "breached" && "border-destructive/40 bg-destructive/10 text-destructive",
        state === "at_risk" && "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
        state === "safe" && "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
      )}
    >
      {label}
    </Badge>
  );
}

export function formatTicketDateTime(value: string | null | undefined, locale: string) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat(locale, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      numberingSystem: "latn",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

/** Isolate datetime as an LTR run so Arabic UI does not reorder digits/AM-PM. */
export function TicketDateTime({
  value,
  locale,
  className,
}: {
  value: string | null | undefined;
  locale: string;
  className?: string;
}) {
  const formatted = formatTicketDateTime(value, locale);
  if (!value) {
    return <span className={className}>{formatted}</span>;
  }
  return (
    <time dateTime={value} dir="ltr" className={cn("inline-block tabular-nums", className)}>
      {formatted}
    </time>
  );
}
