import { CalendarClock, ClipboardList, Hash, UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { OperationsRow } from "@workspace/universal-operations-engine";
import { format } from "date-fns";

type Props = {
  row: OperationsRow | null | undefined;
  isLoading?: boolean;
};

export function EntityOperationPanel({ row, isLoading }: Props) {
  const { t } = useTranslation("common");

  if (isLoading) {
    return (
      <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
        <div className="h-24 animate-pulse rounded-xl bg-muted/40" />
      </section>
    );
  }

  if (!row) return null;

  const status = String(row.values.status ?? row.statusId);
  const service = String(row.values.service ?? "").trim();
  const resource = String(row.values.resource ?? "").trim();
  const reference = String(row.values.reference ?? row.id.slice(0, 8).toUpperCase());
  const scheduledRaw = row.values.scheduled_at ?? row.values.appointment_time;
  const scheduled =
    typeof scheduledRaw === "string" && scheduledRaw
      ? format(new Date(scheduledRaw), "MMM d, yyyy HH:mm")
      : null;

  return (
    <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold tracking-tight">
            {t("entityWorkspace.panels.currentOperation")}
          </h3>
          {service && service !== "—" ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{service}</p>
          ) : null}
        </div>
        <span className="inline-flex items-center rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
          {status}
        </span>
      </div>

      <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
        {resource && resource !== "—" ? (
          <Meta icon={UserRound} label={t("entityWorkspace.panels.assignedResource")} value={resource} />
        ) : null}
        <Meta icon={Hash} label={t("entityWorkspace.operation.number")} value={reference} />
        {scheduled ? (
          <Meta icon={CalendarClock} label={t("entityWorkspace.operation.startTime")} value={scheduled} />
        ) : null}
        <Meta icon={ClipboardList} label={t("entityWorkspace.panels.operationStatus")} value={status} />
      </div>
    </section>
  );
}

function Meta({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Hash;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl bg-muted/30 px-3 py-2.5">
      <Icon className="mt-0.5 size-3.5 shrink-0 text-primary" />
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}
