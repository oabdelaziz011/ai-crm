type BillingPaginationProps = {
  page: number;
  totalPages: number;
  total: number;
  pageInfoLabel: string;
  previousLabel: string;
  nextLabel: string;
  onPrevious: () => void;
  onNext: () => void;
};

export function BillingPagination({
  page,
  totalPages,
  total,
  pageInfoLabel,
  previousLabel,
  nextLabel,
  onPrevious,
  onNext,
}: BillingPaginationProps) {
  if (total <= 0) return null;

  return (
    <div className="flex flex-col gap-3 border-t border-white/5 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
      <span className="text-muted-foreground">{pageInfoLabel}</span>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={onPrevious}
          className="rounded-lg border border-white/10 px-3 py-1.5 disabled:opacity-40 hover:bg-white/5"
        >
          {previousLabel}
        </button>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={onNext}
          className="rounded-lg border border-white/10 px-3 py-1.5 disabled:opacity-40 hover:bg-white/5"
        >
          {nextLabel}
        </button>
      </div>
    </div>
  );
}
