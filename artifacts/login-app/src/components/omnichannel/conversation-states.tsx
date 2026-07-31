import { memo } from "react";
import { DashboardCard } from "@/components/dashboard/ui";

type ConversationStatesProps = {
  title: string;
  description: string;
  action?: React.ReactNode;
};

export const ConversationEmptyState = memo(function ConversationEmptyState({
  title,
  description,
  action,
}: ConversationStatesProps) {
  return (
    <DashboardCard className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      {action}
    </DashboardCard>
  );
});

export const ConversationLoadingState = memo(function ConversationLoadingState({
  label,
}: {
  label: string;
}) {
  return (
    <DashboardCard className="flex h-full items-center justify-center p-8">
      <p className="text-sm text-muted-foreground">{label}</p>
    </DashboardCard>
  );
});

export const ConversationPermissionState = memo(function ConversationPermissionState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return <ConversationEmptyState title={title} description={description} />;
});
