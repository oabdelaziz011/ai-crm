import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";
import { EnterpriseEmptyState } from "@/components/enterprise";

type BillingEmptyStateProps = {
  title: string;
  description?: string;
  icon?: LucideIcon;
};

export function BillingEmptyState({
  title,
  description,
  icon: Icon = Inbox,
}: BillingEmptyStateProps) {
  return (
    <EnterpriseEmptyState
      title={title}
      description={description || "Nothing to show here yet. Complete setup or wait for the first records to appear."}
      icon={<Icon className="size-6" aria-hidden />}
      compact
    />
  );
}
