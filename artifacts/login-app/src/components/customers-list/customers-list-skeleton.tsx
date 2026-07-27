import { Skeleton } from "@/components/ui/skeleton";
import { DENSITY_ROW_HEIGHT, type CustomerListDensity } from "@/lib/customers-list";

type CustomersListSkeletonProps = {
  density?: CustomerListDensity;
  rows?: number;
};

export function CustomersListSkeleton({
  density = "comfortable",
  rows = 8,
}: CustomersListSkeletonProps) {
  const rowHeight = DENSITY_ROW_HEIGHT[density];

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="sticky top-0 z-10 border-b border-border bg-muted/20 px-4 py-3">
        <div className="flex gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-4 flex-1 max-w-[120px]" />
          ))}
        </div>
      </div>
      <div>
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 px-4 border-b border-border/60"
            style={{ height: rowHeight }}
          >
            <Skeleton className="h-4 w-4 rounded-sm shrink-0" />
            <Skeleton className="h-8 w-8 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="h-3 w-28" />
            </div>
            <Skeleton className="h-3 w-24 hidden md:block" />
            <Skeleton className="h-3 w-20 hidden lg:block" />
            <Skeleton className="h-6 w-16 rounded-full hidden lg:block" />
          </div>
        ))}
      </div>
    </div>
  );
}
