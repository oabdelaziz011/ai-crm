type Props = {
  title: string;
  subtitle?: string;
};

export function TimelineHeader({ title, subtitle }: Props) {
  return (
    <div className="rounded-xl border border-border/60 bg-background px-4 py-3">
      <h3 className="text-base font-semibold tracking-tight">{title}</h3>
      {subtitle ? <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{subtitle}</p> : null}
    </div>
  );
}
