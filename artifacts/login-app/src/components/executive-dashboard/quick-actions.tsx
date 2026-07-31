import { memo } from "react";
import type { LucideIcon } from "lucide-react";
import {
  CalendarPlus,
  FileText,
  Megaphone,
  Sparkles,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DashboardCard } from "@/components/dashboard/ui";
import type { ExecutiveQuickActionModel } from "@/lib/dashboard";

const ICONS: Record<string, LucideIcon> = {
  UserPlus,
  CalendarPlus,
  FileText,
  Megaphone,
  Sparkles,
};

type QuickActionsProps = {
  title: string;
  actions: ExecutiveQuickActionModel[];
  resolveLabel: (action: ExecutiveQuickActionModel) => string;
  canRun: (action: ExecutiveQuickActionModel) => boolean;
  onAction: (action: ExecutiveQuickActionModel) => void;
};

export const QuickActions = memo(function QuickActions({
  title,
  actions,
  resolveLabel,
  canRun,
  onAction,
}: QuickActionsProps) {
  return (
    <section aria-label={title}>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {title}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {actions.map((action) => {
          const Icon = ICONS[action.icon] ?? Sparkles;
          const enabled = canRun(action);

          return (
            <DashboardCard key={action.id} className="p-4">
              <Button
                variant="ghost"
                className="h-auto w-full flex-col items-start gap-3 whitespace-normal px-0 py-0 text-start hover:bg-transparent"
                disabled={!enabled}
                onClick={() => onAction(action)}
              >
                <div className="flex size-10 items-center justify-center rounded-lg border border-border bg-muted/40">
                  <Icon className="size-[18px] text-primary" aria-hidden />
                </div>
                <span className="text-sm font-medium leading-snug">{resolveLabel(action)}</span>
              </Button>
            </DashboardCard>
          );
        })}
      </div>
    </section>
  );
});
