import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { useAuthUser } from "@/hooks/use-rbac";
import { useToast } from "@/hooks/use-toast";
import {
  useSalesFollowUpDraftActions,
  useSalesFollowUpDrafts,
} from "@/hooks/sales/use-sales-follow-up-drafts";
import { useSalesFollowUpSettings } from "@/hooks/sales/use-sales-follow-up-settings";
import { resolveSalesFollowUpDraftsInboxState } from "@/lib/sales-follow-up/sales-follow-up-settings";
import type { SalesFollowUpReviewItem, SalesFollowUpReviewStatus } from "@/lib/sales-follow-up/sales-follow-up-drafts-api";
import {
  DashboardCard,
  DashboardErrorBanner,
  DashboardTableSkeleton,
} from "@/components/dashboard/ui";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { nestedSectionHref } from "@/lib/routing";
import { cn } from "@/lib/utils";

const STATUS_FILTERS: Array<SalesFollowUpReviewStatus | "all"> = [
  "pending_review",
  "sent",
  "failed",
  "cancelled",
  "all",
];

function statusBadgeClass(status: SalesFollowUpReviewStatus): string {
  switch (status) {
    case "pending_review":
      return "bg-amber-500/15 text-amber-800 dark:text-amber-200";
    case "sent":
      return "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200";
    case "failed":
      return "bg-red-500/15 text-red-800 dark:text-red-200";
    case "cancelled":
      return "bg-muted text-muted-foreground";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function DraftCard({
  item,
  canEdit,
  busy,
  onSave,
  onApprove,
  onReject,
  onReschedule,
}: {
  item: SalesFollowUpReviewItem;
  canEdit: boolean;
  busy: boolean;
  onSave: (jobId: string, text: string) => void;
  onApprove: (jobId: string, text: string) => void;
  onReject: (jobId: string) => void;
  onReschedule: (jobId: string, dueAt: string) => void;
}) {
  const { t } = useTranslation("common");
  const [text, setText] = useState(item.messageText);
  const [dueAt, setDueAt] = useState(() => {
    const d = new Date(item.dueAt);
    if (Number.isNaN(d.getTime())) return "";
    return d.toISOString().slice(0, 16);
  });
  const isDraft = item.status === "pending_review";

  return (
    <DashboardCard className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex rounded-md px-2 py-0.5 text-xs font-medium",
                statusBadgeClass(item.status),
              )}
            >
              {t(`leads.followUpDrafts.status.${item.status}`)}
            </span>
            {item.channel ? (
              <span className="text-xs text-muted-foreground">{item.channel}</span>
            ) : null}
            <span className="text-xs text-muted-foreground">
              {t("leads.followUpDrafts.attempt", { n: item.attemptNumber })}
            </span>
          </div>
          <h3 className="text-sm font-semibold text-foreground">
            {item.contactName || item.leadTitle || item.leadId}
          </h3>
          {item.productInterestName ? (
            <p className="text-xs text-muted-foreground">
              {t("leads.followUpDrafts.productInterest", { name: item.productInterestName })}
            </p>
          ) : null}
          {item.errorMessage ? (
            <p className="text-xs text-muted-foreground">
              {t("leads.followUpDrafts.reason")}: {item.errorMessage}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`${nestedSectionHref("/table")}?leadId=${encodeURIComponent(item.leadId)}`}
            className="inline-flex min-h-8 items-center rounded-md border border-[var(--button-outline)] px-3 text-xs font-medium shadow-xs"
          >
            {t("leads.followUpDrafts.openLead")}
          </Link>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`draft-${item.jobId}`}>{t("leads.followUpDrafts.message")}</Label>
        <Textarea
          id={`draft-${item.jobId}`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={!canEdit || !isDraft || busy}
          rows={5}
          className="min-h-[120px] resize-y text-sm"
        />
      </div>

      {isDraft && canEdit ? (
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor={`due-${item.jobId}`}>{t("leads.followUpDrafts.scheduledFor")}</Label>
            <Input
              id={`due-${item.jobId}`}
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              disabled={busy}
              className="w-[220px]"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy || text.trim() === item.messageText}
              onClick={() => onSave(item.jobId, text)}
            >
              {t("leads.followUpDrafts.save")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy || !dueAt}
              onClick={() => onReschedule(item.jobId, new Date(dueAt).toISOString())}
            >
              {t("leads.followUpDrafts.reschedule")}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={busy || !text.trim()}
              onClick={() => onApprove(item.jobId, text)}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("leads.followUpDrafts.approveSend")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={busy}
              onClick={() => onReject(item.jobId)}
            >
              {t("leads.followUpDrafts.reject")}
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {t("leads.followUpDrafts.scheduledFor")}:{" "}
          {new Date(item.dueAt).toLocaleString()}
        </p>
      )}
    </DashboardCard>
  );
}

export function LeadsFollowUpDraftsPage() {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const { profile } = useAuth();
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const companyId = profile?.company_id ?? null;
  const canView = isSuperAdmin || hasPermission("leads.view");
  const canEdit = isSuperAdmin || hasPermission("leads.edit") || hasPermission("leads.manage");

  const [status, setStatus] = useState<SalesFollowUpReviewStatus | "all">("pending_review");
  const { data, isLoading, error, refetch, isFetching } = useSalesFollowUpDrafts(companyId, status);
  const actions = useSalesFollowUpDraftActions(companyId);

  const busy = actions.approve.isPending || actions.reject.isPending || actions.saveMessage.isPending || actions.reschedule.isPending;

  const items = useMemo(() => data ?? [], [data]);
  // Settings read is best-effort: a viewer without settings access just sees the plain empty state.
  const settings = useSalesFollowUpSettings(companyId);
  const inboxState = resolveSalesFollowUpDraftsInboxState({
    isLoading: isLoading || (settings.isLoading && items.length === 0 && !error),
    hasError: Boolean(error),
    itemCount: items.length,
    configState: settings.data?.configState ?? null,
  });

  if (!canView) {
    return (
      <DashboardErrorBanner
        message={`${t("leads.followUpDrafts.noPermission")} — ${t("leads.followUpDrafts.noPermissionBody")}`}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{t("leads.followUpDrafts.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("leads.followUpDrafts.subtitle")}</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
          {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : t("leads.followUpDrafts.refresh")}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((filter) => (
          <Button
            key={filter}
            type="button"
            size="sm"
            variant={status === filter ? "default" : "outline"}
            onClick={() => setStatus(filter)}
          >
            {t(`leads.followUpDrafts.filters.${filter}`)}
          </Button>
        ))}
      </div>

      {inboxState === "error" ? (
        <DashboardErrorBanner
          message={`${t("leads.followUpDrafts.loadError")}: ${
            error instanceof Error ? error.message : String(error)
          }`}
        />
      ) : null}

      {inboxState === "loading" ? <DashboardTableSkeleton /> : null}

      {inboxState === "unconfigured" || inboxState === "disabled" ? (
        <DashboardCard className="space-y-2 p-6 text-sm" role="status">
          <p className="font-medium text-foreground">
            {t(`leads.followUpDrafts.states.${inboxState}.title`)}
          </p>
          <p className="text-muted-foreground">{t(`leads.followUpDrafts.states.${inboxState}.body`)}</p>
          <Link
            href="~/dashboard/settings/sales/follow-up"
            className="inline-flex text-xs font-medium text-foreground underline-offset-2 hover:underline"
          >
            {t("leads.followUpDrafts.states.openSettings")}
          </Link>
        </DashboardCard>
      ) : null}

      {inboxState === "empty" ? (
        <DashboardCard className="p-6 text-sm text-muted-foreground">
          {t("leads.followUpDrafts.empty")}
        </DashboardCard>
      ) : null}

      <div className="flex flex-col gap-3">
        {items.map((item) => (
          <DraftCard
            key={item.jobId}
            item={item}
            canEdit={canEdit}
            busy={busy}
            onSave={(jobId, messageText) => {
              actions.saveMessage.mutate(
                { jobId, messageText },
                {
                  onSuccess: () =>
                    toast({ title: t("leads.followUpDrafts.saved") }),
                  onError: (err) =>
                    toast({
                      title: t("leads.followUpDrafts.saveFailed"),
                      description: err instanceof Error ? err.message : String(err),
                      variant: "destructive",
                    }),
                },
              );
            }}
            onApprove={(jobId, messageText) => {
              actions.approve.mutate(
                { jobId, messageText },
                {
                  onSuccess: () =>
                    toast({ title: t("leads.followUpDrafts.approved") }),
                  onError: (err) =>
                    toast({
                      title: t("leads.followUpDrafts.approveFailed"),
                      description: err instanceof Error ? err.message : String(err),
                      variant: "destructive",
                    }),
                },
              );
            }}
            onReject={(jobId) => {
              actions.reject.mutate(
                { jobId },
                {
                  onSuccess: () =>
                    toast({ title: t("leads.followUpDrafts.rejected") }),
                  onError: (err) =>
                    toast({
                      title: t("leads.followUpDrafts.rejectFailed"),
                      description: err instanceof Error ? err.message : String(err),
                      variant: "destructive",
                    }),
                },
              );
            }}
            onReschedule={(jobId, dueAtIso) => {
              actions.reschedule.mutate(
                { jobId, dueAt: dueAtIso },
                {
                  onSuccess: () =>
                    toast({ title: t("leads.followUpDrafts.rescheduled") }),
                  onError: (err) =>
                    toast({
                      title: t("leads.followUpDrafts.rescheduleFailed"),
                      description: err instanceof Error ? err.message : String(err),
                      variant: "destructive",
                    }),
                },
              );
            }}
          />
        ))}
      </div>
    </div>
  );
}
