import type { ReactNode } from "react";

type CalendarToolbarProps = {
  title: ReactNode;
  navigation: ReactNode;
  viewSwitcher: ReactNode;
  actions?: ReactNode;
};

export function CalendarToolbar({
  title,
  navigation,
  viewSwitcher,
  actions,
}: CalendarToolbarProps) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">{title}</h1>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {navigation}
        {viewSwitcher}
        {actions}
      </div>
    </div>
  );
}
