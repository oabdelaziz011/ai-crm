import { ListPagination } from "@/components/ui/list-pagination";

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

/** Billing list footer — shared RTL-safe pagination. */
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
  return (
    <ListPagination
      className="border-t border-white/5 p-4 text-sm"
      page={page}
      totalPages={totalPages}
      total={total}
      hideWhenEmpty
      summaryLabel={pageInfoLabel}
      previousLabel={previousLabel}
      nextLabel={nextLabel}
      onPrevious={onPrevious}
      onNext={onNext}
    />
  );
}
