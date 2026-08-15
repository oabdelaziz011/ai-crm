type Props = {
  label: string;
};

export function TimelineDateDivider({ label }: Props) {
  return (
    <div className="sticky top-0 z-[1] -mx-1 bg-background px-1 py-2">
      <div className="flex items-center gap-3">
        <h3 className="shrink-0 text-[11px] font-bold uppercase tracking-[0.12em] text-foreground/80">
          {label}
        </h3>
        <div className="h-px flex-1 bg-border/70" />
      </div>
    </div>
  );
}
