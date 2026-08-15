import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, MessageSquare } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  type TicketPriority,
  type TicketStatus,
} from "@workspace/ticket-platform";
import type { TicketInboxRow } from "@/lib/tickets/enrich-ticket-rows";
import { resolveTicketSlaState } from "@/lib/tickets/ticket-inbox-metrics";

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

  useEffect(() => {
    if (open) {
      setTab("overview");
      setCommentBody("");
      setCommentInternal(true);
    }
  }, [open, ticketId]);

  const ticket = detail.data?.ticket ? toInboxRow(detail.data.ticket as TicketInboxRow) : null;
  const comments = detail.data?.comments ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={ENTITY_360_DIALOG_CONTENT_CLASS} dir={direction}>
        <DialogTitle className="sr-only">{t("tickets.360.title")}</DialogTitle>

        {detail.isError ? (
          <div className="p-6">
            <EnterpriseEmptyState
              title={t("tickets.360.loadErrorTitle")}
              description={t("tickets.360.loadErrorBody")}
            />
          </div>
        ) : detail.isLoading || !ticket ? (
          <div className="flex flex-1 items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t("tickets.360.loading")}
          </div>
        ) : (
          <>
            <Ticket360Header
              ticket={ticket}
              canAssign={canAssign}
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
                  <div className="space-y-4 border-t border-border/50 p-5 text-start sm:p-6">
                    <div className="grid gap-3 sm:grid-cols-2">
                      {canEdit || canClose ? (
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-muted-foreground">
                            {t("tickets.columns.status")}
                          </p>
                          <Select
                            value={ticket.status}
                            onValueChange={(value) =>
                              void commands.changeStatus
                                .mutateAsync({ ticketId: ticket.id, status: value as TicketStatus })
                                .then(
                                  () => toast({ title: t("tickets.toasts.statusUpdated") }),
                                  (error) =>
                                    toast({
                                      title: t("tickets.toasts.statusFailed"),
                                      description: error instanceof Error ? error.message : undefined,
                                      variant: "destructive",
                                    }),
                                )
                            }
                          >
                            <SelectTrigger className="rounded-xl">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {TICKET_STATUSES.map((status) => (
                                <SelectItem key={status} value={status}>
                                  {t(`tickets.status.${status}`)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : null}
                      {canEdit ? (
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-muted-foreground">
                            {t("tickets.columns.priority")}
                          </p>
                          <Select
                            value={ticket.priority}
                            onValueChange={(value) =>
                              void commands.changePriority
                                .mutateAsync({
                                  ticketId: ticket.id,
                                  priority: value as TicketPriority,
                                })
                                .then(
                                  () => toast({ title: t("tickets.toasts.priorityUpdated") }),
                                  (error) =>
                                    toast({
                                      title: t("tickets.toasts.priorityFailed"),
                                      description: error instanceof Error ? error.message : undefined,
                                      variant: "destructive",
                                    }),
                                )
                            }
                          >
                            <SelectTrigger className="rounded-xl">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {TICKET_PRIORITIES.map((item) => (
                                <SelectItem key={item} value={item}>
                                  {t(`tickets.priority.${item}`)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : null}
                    </div>

                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold">{t("tickets.commentsTitle")}</h4>
                      {comments.length === 0 ? (
                        <p className="text-sm text-muted-foreground">{t("tickets.noComments")}</p>
                      ) : (
                        <ul className="space-y-2">
                          {comments.map((comment) => (
                            <li
                              key={comment.id}
                              className="rounded-xl border border-border/50 px-3 py-2 text-sm"
                            >
                              <p className="text-[11px] text-muted-foreground">
                                {comment.isInternal
                                  ? t("tickets.internalNote")
                                  : t("tickets.publicComment")}
                              </p>
                              <p className="mt-1 whitespace-pre-wrap">{comment.body}</p>
                            </li>
                          ))}
                        </ul>
                      )}
                      {canComment ? (
                        <div className="space-y-2 rounded-xl border border-border/50 p-3">
                          <Textarea
                            value={commentBody}
                            onChange={(event) => setCommentBody(event.target.value)}
                            placeholder={t("tickets.commentPlaceholder")}
                            className="min-h-[80px] rounded-xl"
                          />
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <label className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Checkbox
                                checked={commentInternal}
                                onCheckedChange={(value) => setCommentInternal(value === true)}
                              />
                              {t("tickets.internalNote")}
                            </label>
                            <Button
                              type="button"
                              size="sm"
                              className="rounded-lg"
                              disabled={!commentBody.trim() || commands.addComment.isPending}
                              onClick={() =>
                                void commands.addComment
                                  .mutateAsync({
                                    ticketId: ticket.id,
                                    body: commentBody.trim(),
                                    isInternal: commentInternal,
                                  })
                                  .then(() => {
                                    setCommentBody("");
                                    toast({ title: t("tickets.toasts.commentAdded") });
                                  })
                              }
                            >
                              {t("tickets.addComment")}
                            </Button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="conversation" className="m-0">
                  <div className="p-5 sm:p-6">
                    <EnterpriseEmptyState
                      icon={<MessageSquare className="size-6" aria-hidden />}
                      title={
                        ticket.conversationId
                          ? t("tickets.360.conversationLinkedTitle")
                          : t("tickets.360.noConversationTitle")
                      }
                      description={
                        ticket.conversationId
                          ? t("tickets.360.conversationLinkedBody", {
                              id: ticket.conversationId.slice(0, 8),
                            })
                          : t("tickets.360.noConversationBody")
                      }
                    />
                  </div>
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
        )}
      </DialogContent>
    </Dialog>
  );
}
