import { Download, Plus, Search, Upload, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Full-width CRM page header (HubSpot / Attio style).
 * Title + subtitle on the left; search + actions on the right.
 */
export function LeadsCrmTopBar({
  search,
  onSearchChange,
  onImport,
  onExport,
  onCreate,
  canCreate,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  onImport: () => void;
  onExport: () => void;
  onCreate: () => void;
  canCreate: boolean;
}) {
  const { t } = useTranslation("common");

  return (
    <header className="flex flex-col gap-4 border-b border-border/60 pb-4 lg:flex-row lg:items-end lg:justify-between lg:gap-6">
      <div className="min-w-0 shrink-0 space-y-1">
        <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.02em] text-foreground">
          {t("leads.workspace.title")}
        </h1>
        <p className="max-w-lg text-[13px] leading-5 text-muted-foreground">
          {t("leads.workspace.subtitle")}
        </p>
      </div>

      <div className="flex w-full min-w-0 flex-col gap-2.5 sm:flex-row sm:items-center lg:w-auto lg:justify-end">
        <div className="relative w-full sm:max-w-[280px] lg:w-[280px]">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/60" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t("leads.table.search")}
            className={cn(
              "h-9 rounded-lg border-border/70 bg-background ps-9 pe-8 text-[13px] shadow-none",
              "placeholder:text-muted-foreground/55",
              "focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/30",
            )}
          />
          {search ? (
            <button
              type="button"
              className="absolute end-2 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:text-foreground"
              onClick={() => onSearchChange("")}
              aria-label="Clear"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 rounded-lg border-border/70 px-3 text-[13px] font-medium shadow-none"
            onClick={onImport}
          >
            <Upload className="size-3.5 opacity-70" />
            {t("leads.workspace.import")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 rounded-lg border-border/70 px-3 text-[13px] font-medium shadow-none"
            onClick={onExport}
          >
            <Download className="size-3.5 opacity-70" />
            {t("leads.workspace.export")}
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-9 gap-1.5 rounded-lg px-3.5 text-[13px] font-semibold shadow-none"
            onClick={onCreate}
            disabled={!canCreate}
          >
            <Plus className="size-3.5" strokeWidth={2.5} />
            {t("leads.workspace.newLead")}
          </Button>
        </div>
      </div>
    </header>
  );
}
