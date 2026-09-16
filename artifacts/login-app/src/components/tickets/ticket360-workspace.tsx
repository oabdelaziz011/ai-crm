import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import {
  ENTITY_360_DIALOG_CONTENT_CLASS,
  ENTITY_360_TAB_TRIGGER_CLASS,
  ENTITY_360_TABS_LIST_CLASS,
} from "@/components/entity-workspace/entity-360-dialog-shell";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EnterpriseEmptyState } from "@/components/enterprise";
import { Ticket360Header } from "@/components/tickets/ticket360-header";
import { Ticket360Overview } from "@/components/tickets/ticket360-overview";
import { Ticket360ConversationPanel } from "@/components/tickets/ticket360-conversation-panel";
import { Ticket360CustomerPanel } from "@/components/tickets/ticket360-customer-panel";
import {
  Ticket360ActivityPanel,
  Ticket360AuditPanel,
} from "@/components/tickets/ticket360-activity-panel";
import { useTicketDetail, useTicketCommands } from "@/hooks/tickets/use-tickets";
import { useTicketServiceContext } from "@/hooks/tickets/use-ticket-services";
import { useToast } from "@/hooks/use-toast";
import { useCustomerProfile } from "@/context/customer-profile-context";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { TicketPriority, TicketStatus } from "@workspace/ticket-platform";
import type { TicketInboxRow } from "@/lib/tickets/enrich-ticket-rows";
import { resolveTicketSlaState } from "@/lib/tickets/ticket-inbox-metrics";
import {
  shouldIgnoreTicket360Dismiss,
  shouldResetTicket360Session,
} from "@/lib/tickets/ticket360-modal-lifecycle";
import {
  isAnyNestedOverlayOpen,
  isWithinNestedOverlayGracePeriod,
  noteNestedOverlayActivity,
} from "@/lib/ui/prevent-dialog-dismiss-for-nested-overlay";
import { TicketDateTime } from "@/components/tickets/ticket-badges";

const TABS = ["overview", "conversation", "customer", "activity", "audit"] as const;
type Ticket360Tab = (typeof TABS)[number];

function toInboxRow(ticket: TicketInboxRow | (TicketInboxRow & Record<string, unknown>)): TicketInboxRow {
  const row = ticket as TicketInboxRow;
  return {
    ...row,
    customerName: row.customerName ?? null,
    customerPhone: row.customerPhone ?? null,
    customerEmail: row.customerEmail ?? null,
    channelType: row.channelType ?? null,
    lastCustomerActivityAt: row.lastCustomerActivityAt ?? null,
    slaState:
      row.slaState ??
      resolveTicketSlaState({
        slaDueAt: row.slaDueAt,
        status: row.status,
        resolvedAt: row.resolvedAt,
        closedAt: row.closedAt,
      }),
  };
}

export function Ticket360Workspace({
  ticketId,
  open,
  onOpenChange,
  onOpenTicket,
  onAssignRequest,
}: {
  ticketId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenTicket?: (ticketId: string) => void;
  onAssignRequest?: (ticketId: string) => void;
}) {
  const { t, i18n } = useTranslation("common");
  const { toast } = useToast();
  const { openCustomerProfile } = useCustomerProfile();
  const { canAssign, canEdit, canClose, canComment } = useTicketServiceContext();
  const detail = useTicketDetail(open ? ticketId : null);
  const commands = useTicketCommands();
  const [tab, setTab] = useState<Ticket360Tab>("overview");
  const [commentBody, setCommentBody] = useState("");
  const [commentInternal, setCommentInternal] = useState(true);
  const direction = i18n.dir();
  const wasOpenRef = useRef(false);
  const previousTicketIdRef = useRef<string | null>(null);

  const mutationPending =
    commands.changeStatus.isPending ||
    commands.changePriority.isPending ||
    commands.addComment.isPending ||
    commands.unassignTicket.isPending ||
    commands.assignTicket.isPending;

  useEffect(() => {
    if (
      shouldResetTicket360Session({
        open,
        ticketId,
        wasOpen: wasOpenRef.current,
        previousTicketId: previousTicketIdRef.current,
      })
    ) {
      setTab("overview");
      setCommentBody("");
      setCommentInternal(true);
    }
    wasOpenRef.current = open;
    if (open && ticketId) previousTicketIdRef.current = ticketId;
    if (!open) previousTicketIdRef.current = null;
  }, [open, ticketId]);

  const ticket = detail.data?.ticket ? toInboxRow(detail.data.ticket as TicketInboxRow) : null;
  const comments = detail.data?.comments ?? [];
  // Keep last ticket visible while refetching so invalidation does not flash an empty shell.
  const showLoading = (detail.isLoading || detail.isPending) && !ticket;

  const handleOpenChange = (nextOpen: boolean) => {
    if (
      shouldIgnoreTicket360Dismiss({
        nextOpen,
        nestedOverlayOpen: isAnyNestedOverlayOpen(),
        withinNestedOverlayGrace: isWithinNestedOverlayGracePeriod(),
        mutationPending,
      })
    ) {
      return;
    }
    onOpenChange(nextOpen);
  };

  const handleStatusChange = (status: TicketStatus) => {
    if (!ticket || commands.changeStatus.isPending) return;
    if (status === ticket.status) return;
    noteNestedOverlayActivity();
    void commands.changeStatus
      .mutateAsync({ ticketId: ticket.id, status })
      .then(
        () => toast({ title: t("tickets.toasts.statusUpdated") }),
        (error) =>
          toast({
            title: t("tickets.toasts.statusFailed"),
            description: error instanceof Error ? error.message : undefined,
            variant: "destructive",
          }),
      );
  };

  const handlePriorityChange = (priority: TicketPriority) => {
    if (!ticket || commands.changePriority.isPending) return;
    if (priority === ticket.priority) return;
    noteNestedOverlayActivity();
    void commands.changePriority
      .mutateAsync({ ticketId: ticket.id, priority })
      .then(
        () => toast({ title: t("tickets.toasts.priorityUpdated") }),
        (error) =>
          toast({
            title: t("tickets.toasts.priorityFailed"),
            description: error instanceof Error ? error.message : undefined,
            variant: "destructive",
          }),
      );
  };

  const handleAddComment = () => {
    if (!ticket || !commentBody.trim() || commands.addComment.isPending) return;
    const body = commentBody.trim();
    void commands.addComment
      .mutateAsync({
        ticketId: ticket.id,
        body,
        isInternal: commentInternal,
      })
      .then(
        () => {
          setCommentBody("");
          toast({ title: t("tickets.toasts.commentAdded") });
        },
        (error) =>
          toast({
            title: t("tickets.toasts.commentFailed"),
            description: error instanceof Error ? error.message : undefined,
            variant: "destructive",
          }),
      );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={ENTITY_360_DIALOG_CONTENT_CLASS}
        dir={direction}
        onInteractOutside={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <DialogTitle className="sr-only">{t("tickets.360.title")}</DialogTitle>

        {detail.isError ? (
          <div className="p-6">
            <EnterpriseEmptyState
              title={t("tickets.360.loadErrorTitle")}
              description={t("tickets.360.loadErrorBody")}
            />
          </div>
        ) : showLoading ? (
          <div className="flex flex-1 items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t("tickets.360.loading")}
          </div>
        ) : ticket ? (
          <>
            <Ticket360Header
              ticket={ticket}
              canAssign={canAssign}
              canEditStatus={canEdit || canClose}
              canEditPriority={canEdit}
              statusPending={commands.changeStatus.isPending}
              priorityPending={commands.changePriority.isPending}
              onStatusChange={handleStatusChange}
              onPriorityChange={handlePriorityChange}
              onAssign={() => onAssignRequest?.(ticket.id)}
              onUnassign={() =>
                void commands.unassignTicket.mutateAsync(ticket.id).then(
                  () => toast({ title: t("tickets.toasts.unassigned") }),
                  (error) =>
                    toast({
                      title: t("tickets.toasts.unassignFailed"),
                      description: error instanceof Error ? error.message : undefined,
                      variant: "destructive",
                    }),
                )
              }
              onClose={() => onOpenChange(false)}
            />

            <Tabs
              value={tab}
              onValueChange={(value) => setTab(value as Ticket360Tab)}
              className="flex min-h-0 flex-1 flex-col"
              dir={direction}
            >
              <TabsList className={ENTITY_360_TABS_LIST_CLASS} dir={direction}>
                {TABS.map((id) => (
                  <TabsTrigger key={id} value={id} className={ENTITY_360_TAB_TRIGGER_CLASS}>
                    {t(`tickets.360.tabs.${id}`)}
                  </TabsTrigger>
                ))}
              </TabsList>

              <div className="min-h-0 flex-1 overflow-y-auto">
                <TabsContent value="overview" className="m-0">
                  <Ticket360Overview ticket={ticket} />
                  <section className="space-y-3 border-t border-border/50 p-5 text-start sm:px-6 sm:py-4">
                    <div className="flex flex-wrap items-end justify-between gap-2">
                      <h4 className="text-sm font-semibold">{t("tickets.commentsTitle")}</h4>
                      <p className="text-[11px] text-muted-foreground">
                        {comments.length > 0
                          ? t("tickets.360.commentCount", {
                              count: comments.length,
                              defaultValue: `${comments.length}`,
                            })
                          : null}
                      </p>
                    </div>

                    {comments.length === 0 ? (
                      <p className="rounded-lg bg-muted/20 px-3 py-2.5 text-sm text-muted-foreground">
                        {t("tickets.noComments")}
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {comments.map((comment) => (
                          <li
                            key={comment.id}
                            className="rounded-xl border border-border/50 bg-background px-3 py-2.5 text-sm"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-[11px] font-medium text-muted-foreground">
                                {comment.isInternal
                                  ? t("tickets.internalNote")
                                  : t("tickets.publicComment")}
                              </p>
                              <TicketDateTime
                                value={comment.createdAt}
                                locale={i18n.language}
                                className="text-[11px] text-muted-foreground"
                              />
                            </div>
                            <p className="mt-1.5 whitespace-pre-wrap leading-relaxed">{comment.body}</p>
                          </li>
                        ))}
                      </ul>
                    )}

                    {canComment ? (
                      <div className="space-y-2.5 rounded-xl border border-dashed border-border/70 bg-muted/15 p-3.5">
                        <p className="text-[11px] font-medium text-muted-foreground">
                          {t("tickets.360.addCommentHint", {
                            defaultValue: t("tickets.commentPlaceholder"),
                          })}
                        </p>
                        <Textarea
                          value={commentBody}
                          onChange={(event) => setCommentBody(event.target.value)}
                          placeholder={t("tickets.commentPlaceholder")}
                          className="min-h-[88px] rounded-xl bg-background"
                          disabled={commands.addComment.isPending}
                        />
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <label className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Checkbox
                              checked={commentInternal}
                              disabled={commands.addComment.isPending}
                              onCheckedChange={(value) => setCommentInternal(value === true)}
                            />
                            {t("tickets.internalNote")}
                          </label>
                          <Button
                            type="button"
                            size="sm"
                            className="rounded-lg"
                            disabled={!commentBody.trim() || commands.addComment.isPending}
                            onClick={handleAddComment}
                          >
                            {commands.addComment.isPending ? (
                              <Loader2 className="size-3.5 animate-spin" aria-hidden />
                            ) : null}
                            {t("tickets.addComment")}
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </section>
                </TabsContent>

                <TabsContent value="conversation" className="m-0">
                  <Ticket360ConversationPanel
                    conversationId={ticket.conversationId}
                    channelType={ticket.channelType}
                  />
                </TabsContent>

                <TabsContent value="customer" className="m-0">
                  <Ticket360CustomerPanel
                    customerId={ticket.customerId}
                    onOpenCustomer={(id) => openCustomerProfile({ customerId: id })}
                    onOpenTicket={(id) => onOpenTicket?.(id)}
                  />
                </TabsContent>

                <TabsContent value="activity" className="m-0">
                  <Ticket360ActivityPanel ticketId={ticket.id} />
                </TabsContent>

                <TabsContent value="audit" className="m-0">
                  <Ticket360AuditPanel ticketId={ticket.id} />
                </TabsContent>
              </div>
            </Tabs>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
