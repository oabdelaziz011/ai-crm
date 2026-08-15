import type { ReactNode } from "react";

type CalendarToolbarProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  navigation: ReactNode;
  viewSwitcher: ReactNode;
  actions?: ReactNode;
};

export function CalendarToolbar({
  title,
  subtitle,
  navigation,
  viewSwitcher,
  actions,
}: CalendarToolbarProps) {
  return (
    <div className="space-y-3 bg-background">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-0.5">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {subtitle ? <p className="max-w-xl text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        {navigation}
        {viewSwitcher}
      </div>
    </div>
  );
}
