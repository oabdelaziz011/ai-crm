import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";

type BillingEmptyStateProps = {
  title: string;
  description?: string;
  icon?: LucideIcon;
};

export function BillingEmptyState({ title, description, icon: Icon = Inbox }: BillingEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <Icon className="h-8 w-8 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        {description ? <p className="max-w-md text-sm text-muted-foreground">{description}</p> : null}
      </div>
    </div>
  );
}
