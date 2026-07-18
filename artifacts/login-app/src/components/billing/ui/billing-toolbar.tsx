import type { ReactNode } from "react";
import { Download, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

type BillingToolbarProps = {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  filters?: ReactNode;
  onExport?: () => void;
  exportLabel?: string;
  exportDisabled?: boolean;
};

export function BillingToolbar({
  search,
  onSearchChange,
  searchPlaceholder,
  filters,
  onExport,
  exportLabel = "Export",
  exportDisabled = false,
}: BillingToolbarProps) {
  return (
    <div className="flex flex-col gap-3 border-b border-white/5 p-4 lg:flex-row lg:items-center">
      <div className="relative flex-1">
        <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full rounded-xl border border-white/10 bg-background/50 py-2.5 ps-9 pe-3 text-sm"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {filters}
        {onExport ? (
          <Button variant="outline" size="sm" disabled={exportDisabled} onClick={onExport} className="gap-2">
            <Download className="h-4 w-4" />
            {exportLabel}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
