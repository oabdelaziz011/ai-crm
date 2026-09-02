import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ListPaginationProps = {
  page: number;
  totalPages: number;
  onPrevious: () => void;
  onNext: () => void;
  previousLabel: string;
  nextLabel: string;
  /** Optional centered/adjacent page status (e.g. "Page 1 of 5"). */
  pageInfoLabel?: string;
  /** Optional leading summary (e.g. "1–25 of 100") shown opposite the controls in LTR/RTL. */
  summaryLabel?: string;
  /** Hide the whole control when there is nothing to page (default: false). */
  hideWhenEmpty?: boolean;
  total?: number;
  className?: string;
  size?: "sm" | "default";
  /** When false, omit chevron icons (text-only). Default true. */
  showIcons?: boolean;
  /** Override Previous enabled state (e.g. cursor pagination). */
  canPrevious?: boolean;
  /** Override Next enabled state (e.g. hasMore / cursor pagination). */
  canNext?: boolean;
};

/**
 * Shared list pagination for ValueOR.
 *
 * Semantics (page index / prev / next handlers) are direction-agnostic.
 * Visual order follows the ambient `dir` from i18n (document / ancestors).
 * Chevron icons use `rtl:rotate-180` so they point toward the correct reading edge.
 */
export function ListPagination({
  page,
  totalPages,
  onPrevious,
  onNext,
  previousLabel,
  nextLabel,
  pageInfoLabel,
  summaryLabel,
  hideWhenEmpty = false,
  total,
  className,
  size = "sm",
  showIcons = true,
  canPrevious: canPreviousOverride,
  canNext: canNextOverride,
}: ListPaginationProps) {
  const { t } = useTranslation("common");
  const safeTotalPages = Math.max(1, totalPages);
  const canPrevious = canPreviousOverride ?? page > 1;
  const canNext = canNextOverride ?? page < safeTotalPages;

  if (hideWhenEmpty && typeof total === "number" && total <= 0) {
    return null;
  }

  return (
    <nav
      aria-label={t("pagination.navLabel")}
      className={cn(
        "flex flex-wrap items-center gap-2",
        summaryLabel ? "justify-between" : "justify-end",
        className,
      )}
    >
      {summaryLabel ? (
        <p className="text-xs text-muted-foreground">{summaryLabel}</p>
      ) : null}

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size={size}
          className="gap-1 rounded-lg"
          disabled={!canPrevious}
          onClick={onPrevious}
          aria-label={t("pagination.previousAria", { defaultValue: previousLabel })}
        >
          {showIcons ? (
            <ChevronLeft className="size-4 shrink-0 rtl:rotate-180" aria-hidden />
          ) : null}
          <span>{previousLabel}</span>
        </Button>

        {pageInfoLabel ? (
          <span className="text-xs tabular-nums text-muted-foreground" aria-live="polite">
            {pageInfoLabel}
          </span>
        ) : null}

        <Button
          type="button"
          variant="outline"
          size={size}
          className="gap-1 rounded-lg"
          disabled={!canNext}
          onClick={onNext}
          aria-label={t("pagination.nextAria", { defaultValue: nextLabel })}
        >
          <span>{nextLabel}</span>
          {showIcons ? (
            <ChevronRight className="size-4 shrink-0 rtl:rotate-180" aria-hidden />
          ) : null}
        </Button>
      </div>
    </nav>
  );
}
