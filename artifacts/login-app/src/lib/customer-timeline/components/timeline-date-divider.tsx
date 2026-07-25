type Props = {
  label: string;
};

export function TimelineDateDivider({ label }: Props) {
  return (
    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground sticky top-0 bg-card/95 backdrop-blur py-1">
      {label}
    </h3>
  );
}
