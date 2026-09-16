import { memo } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { HandoffOwnershipView } from "@/hooks/omnichannel/use-conversation-handoff-ownership";

type HandoffOwnershipBadgeProps = {
  view: HandoffOwnershipView;
  className?: string;
};

export const HandoffOwnershipBadge = memo(function HandoffOwnershipBadge({
  view,
  className,
}: HandoffOwnershipBadgeProps) {
  const { t } = useTranslation("common");
  const ownership = view.ownership;

  const ownerLabel =
    view.ownerKind === "ai"
      ? t("omnichannel.handoffOwnership.ai")
      : view.ownerKind === "human"
        ? t("omnichannel.handoffOwnership.human")
        : view.ownerKind === "queue"
          ? t("omnichannel.handoffOwnership.queue")
          : view.ownerKind === "system"
            ? t("omnichannel.handoffOwnership.system")
            : null;

  if (!ownerLabel && !ownership) return null;

  return (
    <div
      className={cn(
        "flex flex-nowrap items-center gap-1 overflow-x-auto text-[10px] leading-tight",
        className,
      )}
      data-testid="handoff-ownership-badge"
    >
      {ownerLabel ? (
        <span className="shrink-0 rounded border border-[var(--ws-border)] bg-[var(--ws-surface-2)] px-1 py-px font-medium">
          {ownerLabel}
          {ownership?.ownerLabel ? ` · ${ownership.ownerLabel}` : ""}
        </span>
      ) : null}
      {ownership?.lifecycleState ? (
        <span className="shrink-0 rounded border border-[var(--ws-border)] px-1 py-px text-[var(--ws-muted)]">
          {t("omnichannel.handoffOwnership.lifecycle")}: {ownership.lifecycleState}
        </span>
      ) : null}
      {ownership?.isPaused ? (
        <span className="shrink-0 rounded border border-amber-500/40 bg-amber-500/10 px-1 py-px text-amber-700 dark:text-amber-300">
          {t("omnichannel.handoffOwnership.paused")}
        </span>
      ) : null}
      <span
        className={cn(
          "shrink-0 rounded border px-1 py-px",
          view.aiAutomatedRepliesAllowed
            ? "border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
            : "border-rose-500/30 text-rose-700 dark:text-rose-300",
        )}
      >
        {view.aiAutomatedRepliesAllowed
          ? t("omnichannel.handoffOwnership.aiAllowed")
          : t("omnichannel.handoffOwnership.aiBlocked")}
      </span>
    </div>
  );
});
