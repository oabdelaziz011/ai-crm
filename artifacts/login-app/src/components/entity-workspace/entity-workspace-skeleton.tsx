export function EntityWorkspaceSkeleton() {
  return (
    <div className="flex min-h-0 flex-col gap-3 rounded-2xl bg-muted/25 p-3 md:p-4">
      <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
        <div className="h-8 w-40 animate-pulse rounded-lg bg-muted/50" />
        <div className="mt-4 flex gap-3">
          <div className="size-12 animate-pulse rounded-full bg-muted/50" />
          <div className="flex-1 space-y-2">
            <div className="h-6 w-48 animate-pulse rounded bg-muted/50" />
            <div className="h-4 w-32 animate-pulse rounded bg-muted/40" />
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-8 w-20 animate-pulse rounded-lg bg-muted/40" />
          ))}
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-12">
        <div className="space-y-3 lg:col-span-9">
          <div className="h-48 animate-pulse rounded-2xl border border-border/60 bg-card" />
          <div className="h-64 animate-pulse rounded-2xl border border-border/60 bg-card" />
        </div>
        <div className="h-96 animate-pulse rounded-2xl border border-border/60 bg-card lg:col-span-3" />
      </div>
    </div>
  );
}
