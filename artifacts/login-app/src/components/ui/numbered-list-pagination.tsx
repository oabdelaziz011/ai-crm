import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { buildNumberedPageWindow } from "@/lib/sales-orders/sales-order-types";
import { cn } from "@/lib/utils";

export type NumberedListPaginationProps = {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  pageSizeOptions?: readonly number[];
  className?: string;
};

export function NumberedListPagination({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50],
  className,
}: NumberedListPaginationProps) {
  const { t } = useTranslation("common");
  const safeTotalPages = Math.max(1, totalPages);
  const current = Math.min(Math.max(1, page), safeTotalPages);
  const from = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const to = total === 0 ? 0 : Math.min(current * pageSize, total);
  const windowPages = buildNumberedPageWindow(current, safeTotalPages);

  return (
    <nav
      aria-label={t("pagination.navLabel")}
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 border-t border-border/50 px-4 py-3",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-xs text-muted-foreground">
          {t("salesOrders.pagination.summary", { from, to, total })}
        </p>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{t("salesOrders.pagination.pageSize")}</span>
          <select
            className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value) || pageSize)}
            aria-label={t("salesOrders.pagination.pageSize")}
          >
            {pageSizeOptions.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1 rounded-lg"
          disabled={current <= 1}
          onClick={() => onPageChange(current - 1)}
          aria-label={t("pagination.previousAria", { defaultValue: t("pagination.previous") })}
        >
          <ChevronLeft className="size-4 shrink-0 rtl:rotate-180" aria-hidden />
          <span>{t("pagination.previous")}</span>
        </Button>

        {windowPages.map((entry, index) =>
          entry === "ellipsis" ? (
            <span
              key={`ellipsis-${index}`}
              className="px-1 text-xs text-muted-foreground"
              aria-hidden
            >
              …
            </span>
          ) : (
            <Button
              key={entry}
              type="button"
              size="sm"
              variant={entry === current ? "default" : "outline"}
              className={cn(
                "min-w-8 rounded-lg px-2 tabular-nums",
                entry === current ? "pointer-events-none" : "",
              )}
              aria-current={entry === current ? "page" : undefined}
              onClick={() => onPageChange(entry)}
            >
              {entry}
            </Button>
          ),
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1 rounded-lg"
          disabled={current >= safeTotalPages}
          onClick={() => onPageChange(current + 1)}
          aria-label={t("pagination.nextAria", { defaultValue: t("pagination.next") })}
        >
          <span>{t("pagination.next")}</span>
          <ChevronRight className="size-4 shrink-0 rtl:rotate-180" aria-hidden />
        </Button>
      </div>
    </nav>
  );
}
