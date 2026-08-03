import { memo } from "react";
import type { BusinessContextField } from "@workspace/universal-operations-engine";
import { useTranslation } from "react-i18next";

export const IntelligenceBusinessContext = memo(function IntelligenceBusinessContext({
  fields,
}: {
  fields: BusinessContextField[];
}) {
  const { t } = useTranslation("common");
  return (
    <div className="rounded-2xl border border-border/60 bg-card/90 p-4">
      <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
        {t("intelligence.businessContext")}
      </p>
      <div className="grid gap-2">
        {fields.map((field) => (
          <div key={field.key} className="flex items-center justify-between rounded-lg border border-border/40 px-3 py-2">
            <span className="text-xs text-muted-foreground">{field.label}</span>
            <span className="max-w-[55%] truncate text-right text-xs font-medium">{field.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
});

export const IntelligenceCommunicationFeed = memo(function IntelligenceCommunicationFeed({
  groups,
  search,
  onSearchChange,
}: {
  groups: Array<{ dateLabel: string; items: Array<{ id: string; channel: string; preview: string; occurredAt: string; actor: string }> }>;
  search?: string;
  onSearchChange?: (v: string) => void;
}) {
  const { t } = useTranslation("common");
  const filtered = groups
    .map((g) => ({
      ...g,
      items: g.items.filter((i) => !search || i.preview.toLowerCase().includes(search.toLowerCase()) || i.channel.includes(search.toLowerCase())),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="space-y-4">
      {onSearchChange && (
        <input
          type="search"
          value={search ?? ""}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t("intelligence.communicationSearch")}
          className="h-8 w-full rounded-lg border border-border/60 bg-background/50 px-3 text-xs"
        />
      )}
      {filtered.map((group) => (
        <div key={group.dateLabel}>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{group.dateLabel}</p>
          <div className="space-y-2">
            {group.items.map((item) => (
              <div key={item.id} className="rounded-xl border border-border/50 bg-card/80 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-primary capitalize">{item.channel.replace("_", " ")}</span>
                  <span className="text-[10px] text-muted-foreground">{new Date(item.occurredAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{item.preview}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">{item.actor}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
});
