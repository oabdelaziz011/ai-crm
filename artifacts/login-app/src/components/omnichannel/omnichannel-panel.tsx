import { memo, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type OmnichannelPanelProps = {
  children: ReactNode;
  className?: string;
  embedded?: boolean;
};

export const OmnichannelPanel = memo(function OmnichannelPanel({
  children,
  className,
  embedded,
}: OmnichannelPanelProps) {
  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden rounded-xl bg-card/30 shadow-sm ring-1 ring-white/[0.06] backdrop-blur-sm transition-shadow duration-150",
        embedded && "rounded-none shadow-none ring-0",
        className,
      )}
    >
      {children}
    </div>
  );
});

export const OmnichannelPanelHeader = memo(function OmnichannelPanelHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex shrink-0 items-start justify-between gap-2 px-4 py-3">
      <div className="min-w-0">
        <h2 className="truncate text-sm font-semibold tracking-tight">{title}</h2>
        {subtitle ? <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
});
