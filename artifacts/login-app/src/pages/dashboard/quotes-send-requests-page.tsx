import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { useCanSendQuotes } from "@/hooks/quotes/use-quote-send";
import {
  useQuoteSendRequestActions,
  useQuoteSendRequests,
  type QuoteSendRequestItem,
} from "@/hooks/quotes/use-quote-send-requests";
import {
  QUOTE_SEND_CONFIRM_SURFACE_LOCK_MS,
  isRejectConfirmAction,
  shouldLockSendRequestCards,
  takeConfirmAction,
  type QuoteSendConfirmAction,
} from "@/lib/quotes/quote-send-requests-confirm";
import { resolveQuoteSendRequestsInboxState } from "@/lib/quotes/quote-send-requests-ui";
import { QuoteSendClientError } from "@/lib/quotes/quote-send-types";
import { formatSalesMoney } from "@/lib/sales/sales-localize";
import {
  DashboardCard,
  DashboardErrorBanner,
  DashboardTableSkeleton,
} from "@/components/dashboard/ui";
import { Quote360Workspace } from "@/components/quotes/quote360-workspace";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

type ConfirmAction = QuoteSendConfirmAction<QuoteSendRequestItem>;

function RequestCard({
  item,
  companyName,
  busy,
  onPreview,
  onApprove,
  onReject,
}: {
  item: QuoteSendRequestItem;
  companyName: string;
  busy: boolean;
  onPreview: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const { t, i18n } = useTranslation("common");
  const requestedAt = useMemo(() => {
    const d = new Date(item.requestedAt);
    return Number.isNaN(d.getTime()) ? item.requestedAt : d.toLocaleString(i18n.language);
  }, [item.requestedAt, i18n.language]);

  return (
    <DashboardCard className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex rounded-md bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-200">
              {t("quotes.sendRequests.status.pending_human_approval")}
            </span>
            <span className="text-xs text-muted-foreground">
              {item.channel === "whatsapp"
                ? t("quotes.send.viaWhatsapp")
                : t("quotes.send.viaEmail")}
            </span>
            <span className="text-xs text-muted-foreground">{item.quoteNumber}</span>
          </div>
          <h3 className="text-sm font-semibold text-foreground">
            {item.contactName || item.title || item.quoteNumber}
          </h3>
          <p className="text-xs text-muted-foreground">
            {t("quotes.sendRequests.company")}: {companyName}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("quotes.sendRequests.total")}:{" "}
            {formatSalesMoney(item.grandTotal, item.currency, i18n.language)}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("quotes.sendRequests.requestedAt")}: {requestedAt}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("quotes.sendRequests.quoteStatus")}: {item.quoteStatus} ·{" "}
            {t("quotes.sendRequests.notSentHint")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onPreview}>
            {t("quotes.sendRequests.preview")}
          </Button>
          <Button type="button" size="sm" disabled={busy} onClick={onApprove}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("quotes.sendRequests.approveSend")}
          </Button>
          <Button type="button" variant="destructive" size="sm" disabled={busy} onClick={onReject}>
            {t("quotes.sendRequests.reject")}
          </Button>
        </div>
      </div>
    </DashboardCard>
  );
}

export function QuotesSendRequestsPage() {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const { profile, company } = useAuth();
  const companyId = profile?.company_id ?? company?.id ?? null;
  const companyName = company?.name ?? profile?.company_id ?? "—";
  const canSend = useCanSendQuotes();

  const { data, isLoading, error, refetch, isFetching } = useQuoteSendRequests(companyId);
  const actions = useQuoteSendRequestActions(companyId);
  const busyQuoteId =
    actions.approve.isPending || actions.reject.isPending
      ? (actions.approve.variables?.quoteId ?? actions.reject.variables?.quoteId ?? null)
      : null;

  const items = useMemo(() => data ?? [], [data]);
  const inboxState = resolveQuoteSendRequestsInboxState({
    canSend,
    isLoading: isLoading || (isFetching && items.length === 0 && !error),
    hasError: Boolean(error),
    itemCount: items.length,
  });

  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);
  const [confirmSubmitting, setConfirmSubmitting] = useState(false);
  const [surfaceLocked, setSurfaceLocked] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const unlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listElRef = useRef<HTMLDivElement | null>(null);
  /** Survives Radix onOpenChange clearing `confirm` before our Action onClick runs. */
  const pendingConfirmRef = useRef<ConfirmAction | null>(null);
  /** Last non-null confirm — used while the dialog exit animation still paints children. */
  const visibleConfirmRef = useRef<ConfirmAction | null>(null);
  /** Imperative gate against ghost clicks after the dialog unmounts (same pointer event). */
  const ignoreCardClicksUntilRef = useRef(0);

  if (confirm) {
    visibleConfirmRef.current = confirm;
  }
  /** Prefer live confirm; while exiting, keep the last action so UI does not flip Approve→Reject. */
  const dialogConfirm = confirm ?? visibleConfirmRef.current;
  const isRejectConfirm = isRejectConfirmAction(dialogConfirm);

  useEffect(() => {
    return () => {
      if (unlockTimerRef.current) clearTimeout(unlockTimerRef.current);
    };
  }, []);

  const cardsLocked = shouldLockSendRequestCards({
    confirmOpen: Boolean(confirm) || confirmSubmitting,
    surfaceLocked,
    busyQuoteId,
  });

  const lockSurfaceBriefly = () => {
    ignoreCardClicksUntilRef.current = Date.now() + QUOTE_SEND_CONFIRM_SURFACE_LOCK_MS;
    // Sync DOM lock — React state alone is too late for same-tick ghost clicks.
    if (listElRef.current) listElRef.current.style.pointerEvents = "none";
    setSurfaceLocked(true);
    if (unlockTimerRef.current) clearTimeout(unlockTimerRef.current);
    unlockTimerRef.current = setTimeout(() => {
      setSurfaceLocked(false);
      if (listElRef.current) listElRef.current.style.pointerEvents = "";
      unlockTimerRef.current = null;
    }, QUOTE_SEND_CONFIRM_SURFACE_LOCK_MS);
  };

  const openConfirm = (action: ConfirmAction) => {
    if (confirmSubmitting) return;
    if (Date.now() < ignoreCardClicksUntilRef.current) return;
    if (actions.approve.isPending || actions.reject.isPending) return;
    pendingConfirmRef.current = action;
    visibleConfirmRef.current = action;
    setConfirm(action);
  };

  const closeConfirm = () => {
    pendingConfirmRef.current = null;
    setConfirmSubmitting(false);
    setConfirm(null);
    // Clear snapshot after exit animation so a flash cannot paint the wrong title.
    window.setTimeout(() => {
      if (!pendingConfirmRef.current) visibleConfirmRef.current = null;
    }, 200);
  };

  /**
   * Keep the dialog open until the mutation settles so the overlay never
   * disappears under the same pointer event (classic Approve→Reject flash).
   * Also: never treat null confirm as "reject" in the dialog copy.
   */
  const runConfirm = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (confirmSubmitting) return;
    const current = pendingConfirmRef.current ?? takeConfirmAction(confirm);
    if (!current) return;
    lockSurfaceBriefly();
    setConfirmSubmitting(true);

    const finish = () => {
      closeConfirm();
    };

    if (current.type === "approve") {
      actions.approve.mutate(
        { quoteId: current.item.quoteId, channel: current.item.channel },
        {
          onSuccess: (result) => {
            if (result.sent) {
              toast({
                title: t("quotes.send.sentTitle"),
                description:
                  result.channel === "whatsapp"
                    ? t("quotes.send.sentWhatsapp", { recipient: result.recipient ?? "" })
                    : t("quotes.send.sentEmail", { recipient: result.recipient ?? "" }),
              });
            } else {
              toast({
                title: t("quotes.send.failedTitle"),
                description: t("quotes.sendRequests.approveNotSent"),
                variant: "destructive",
              });
            }
          },
          onError: (err) => {
            const message =
              err instanceof QuoteSendClientError
                ? err.message
                : err instanceof Error
                  ? err.message
                  : t("quotes.send.failedTitle");
            toast({
              title: t("quotes.send.failedTitle"),
              description: message,
              variant: "destructive",
            });
          },
          onSettled: finish,
        },
      );
      return;
    }

    actions.reject.mutate(
      { quoteId: current.item.quoteId },
      {
        onSuccess: () => {
          toast({ title: t("quotes.sendRequests.rejectSuccess") });
        },
        onError: (err) => {
          toast({
            title: t("quotes.sendRequests.rejectFailed"),
            description: err instanceof Error ? err.message : undefined,
            variant: "destructive",
          });
        },
        onSettled: finish,
      },
    );
  };

  if (inboxState === "forbidden") {
    return (
      <DashboardErrorBanner
        message={`${t("quotes.sendRequests.permissionDenied")} — ${t("quotes.sendRequests.permissionDeniedBody")}`}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6" data-testid="quote-send-requests-page">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            {t("quotes.sendRequests.title")}
          </h1>
          <p className="max-w-2xl text-[13px] text-muted-foreground">
            {t("quotes.sendRequests.subtitle")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="~/dashboard/quotes"
            className="inline-flex min-h-9 items-center rounded-md border border-[var(--button-outline)] px-3 text-xs font-medium shadow-xs"
          >
            {t("quotes.sendRequests.backToQuotes")}
          </Link>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isFetching}
            onClick={() => void refetch()}
          >
            {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : t("quotes.sendRequests.refresh")}
          </Button>
        </div>
      </div>

      {inboxState === "loading" ? <DashboardTableSkeleton rows={4} /> : null}

      {inboxState === "error" ? (
        <DashboardErrorBanner
          message={`${t("quotes.sendRequests.loadFailed")}: ${
            error instanceof Error ? error.message : t("quotes.sendRequests.loadFailedBody")
          }`}
        >
          <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => void refetch()}>
            {t("quotes.sendRequests.refresh")}
          </Button>
        </DashboardErrorBanner>
      ) : null}

      {inboxState === "empty" ? (
        <DashboardCard className={cn("p-8 text-center text-sm text-muted-foreground")}>
          {t("quotes.sendRequests.empty")}
        </DashboardCard>
      ) : null}

      {inboxState === "ready" ? (
        <div
          ref={listElRef}
          className={cn("flex flex-col gap-3", cardsLocked && "pointer-events-none")}
          data-testid="quote-send-requests-list"
          aria-busy={cardsLocked || undefined}
        >
          {items.map((item) => (
            <RequestCard
              key={item.quoteId}
              item={item}
              companyName={companyName}
              busy={busyQuoteId === item.quoteId || cardsLocked}
              onPreview={() => {
                if (confirmSubmitting) return;
                if (Date.now() < ignoreCardClicksUntilRef.current) return;
                setPreviewId(item.quoteId);
              }}
              onApprove={() => openConfirm({ type: "approve", item })}
              onReject={() => openConfirm({ type: "reject", item })}
            />
          ))}
        </div>
      ) : null}

      <AlertDialog
        open={Boolean(confirm)}
        onOpenChange={(open) => {
          if (!open) {
            if (confirmSubmitting) return;
            closeConfirm();
          }
        }}
      >
        <AlertDialogContent
          data-testid="quote-send-confirm-dialog"
          data-confirm-type={dialogConfirm?.type ?? ""}
          onCloseAutoFocus={(event) => {
            // Keep focus from landing on Approve/Reject under the dialog after close.
            event.preventDefault();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isRejectConfirm
                ? t("quotes.sendRequests.confirmRejectTitle")
                : t("quotes.sendRequests.confirmApproveTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isRejectConfirm
                ? t("quotes.sendRequests.confirmRejectBody", {
                    quote: dialogConfirm?.item.quoteNumber ?? "",
                  })
                : t("quotes.sendRequests.confirmApproveBody", {
                    quote: dialogConfirm?.item.quoteNumber ?? "",
                    channel: dialogConfirm?.item.channel ?? "",
                  })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              data-testid="quote-send-confirm-cancel"
              disabled={confirmSubmitting}
            >
              {t("quotes.sendRequests.cancel")}
            </AlertDialogCancel>
            <Button
              type="button"
              data-testid={
                isRejectConfirm ? "quote-send-confirm-reject" : "quote-send-confirm-approve"
              }
              variant={isRejectConfirm ? "destructive" : "default"}
              disabled={confirmSubmitting}
              onClick={runConfirm}
              onPointerDown={(event) => {
                event.stopPropagation();
              }}
            >
              {confirmSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isRejectConfirm ? (
                t("quotes.sendRequests.reject")
              ) : (
                t("quotes.sendRequests.approveSend")
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Quote360Workspace
        quoteId={previewId}
        open={Boolean(previewId)}
        onOpenChange={(next) => {
          if (!next) setPreviewId(null);
        }}
        initialTab="preview"
      />
    </div>
  );
}
