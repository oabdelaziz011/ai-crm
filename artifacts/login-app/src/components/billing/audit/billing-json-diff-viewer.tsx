import { useTranslation } from "react-i18next";
import { buildJsonDiff, formatDiffValue } from "@/lib/billing/json-diff";

type BillingJsonDiffViewerProps = {
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
};

const STATUS_TONE: Record<string, string> = {
  added: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
  removed: "border-rose-500/20 bg-rose-500/10 text-rose-300",
  changed: "border-amber-500/20 bg-amber-500/10 text-amber-200",
};

export function BillingJsonDiffViewer({ before, after }: BillingJsonDiffViewerProps) {
  const { t } = useTranslation("common");
  const rows = buildJsonDiff(before, after);

  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-white/5 bg-white/[0.02] p-4 text-sm text-muted-foreground">
        {t("billing.audit.noDiff")}
      </p>
    );
  }

  return (
    <div className="space-y-2 max-h-80 overflow-y-auto pe-1">
      {rows.map((row) => (
        <div
          key={row.path}
          className={`rounded-xl border px-3 py-2 text-xs ${STATUS_TONE[row.status] ?? "border-white/5 bg-white/[0.02]"}`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <code className="font-mono">{row.path}</code>
            <span className="uppercase tracking-wide">{t(`billing.audit.diff.${row.status}`)}</span>
          </div>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            <div>
              <p className="text-[10px] uppercase tracking-wide opacity-70">{t("billing.audit.before")}</p>
              <p className="mt-1 break-all font-mono">{formatDiffValue(row.before)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide opacity-70">{t("billing.audit.after")}</p>
              <p className="mt-1 break-all font-mono">{formatDiffValue(row.after)}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
