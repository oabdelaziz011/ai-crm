import { Button } from "@/components/ui/button";
import { EnterpriseEmptyState } from "@/components/enterprise";

export function KanbanEmptyState({
  title,
  actionLabel,
  onAction,
  canCreate,
}: {
  title: string;
  actionLabel: string;
  onAction?: () => void;
  canCreate?: boolean;
}) {
  return (
    <EnterpriseEmptyState
      title={title}
      description=" "
      compact
      className="border-0 bg-transparent py-8 shadow-none"
      primaryAction={
        canCreate && onAction
          ? {
              label: actionLabel,
              onClick: onAction,
            }
          : undefined
      }
    />
  );
}

export function KanbanColumnEmptyInline({
  title,
  actionLabel,
  onAction,
  canCreate,
}: {
  title: string;
  actionLabel: string;
  onAction?: () => void;
  canCreate?: boolean;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/70 px-3 py-8 text-center">
      <p className="text-[13px] text-muted-foreground">{title}</p>
      {canCreate && onAction ? (
        <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
