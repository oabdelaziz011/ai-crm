type Props = {
  title: string;
  subtitle?: string;
};

export function TimelineHeader({ title, subtitle }: Props) {
  return (
    <div>
      <h3 className="font-semibold">{title}</h3>
      {subtitle ? <p className="text-xs text-muted-foreground mt-1">{subtitle}</p> : null}
    </div>
  );
}
