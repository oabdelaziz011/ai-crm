import { useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowDownLeft, ArrowUpRight, ChevronDown, Loader2, MessageSquareText } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { WorkspaceSkeleton } from "@/components/customer-workspace/workspace-ui";
import {
  WorkspaceInlineEmpty,
  WorkspaceStatusChip,
  WorkspaceTabFrame,
} from "@/components/customer-workspace/workspace-tab-frame";
import {
  useCustomerSmsConversations,
  useCustomerSmsThreadMessages,
} from "@/hooks/customer-workspace/use-customer-sms-conversations";
import { useEmployeeIdentities } from "@/hooks/employee-identity/use-employee-identity";
import { useCustomerWorkspaceAccess } from "@/hooks/customer-workspace/use-customer-workspace-access";
import {
  CUSTOMER_SMS_PAGE_SIZE,
  customerSmsMessageSnippet,
  customerSmsOpenConversationHref,
  normalizeCustomerSmsDeliveryStatus,
  resolveCustomerSmsDirection,
  resolveCustomerSmsMessageActor,
  resolveCustomerSmsThreadPhone,
} from "@/lib/customer-workspace/customer-sms-timeline";
import type { ConversationRecord } from "@workspace/ai-conversation";
import type { Customer } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  customer: Customer;
};

function formatWhen(value: string | null, locale: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale.startsWith("ar") ? "ar" : "en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function WorkspaceSmsTab({ customer }: Props) {
  const { t, i18n } = useTranslation("common");
  const access = useCustomerWorkspaceAccess("sms");
  const canView = access.isTabAccessible("sms");
  const list = useCustomerSmsConversations(canView ? customer.id : null);
  const rows = useMemo(
    () => list.data?.pages.flatMap((page) => page.rows) ?? [],
    [list.data],
  );
  const assignedIds = useMemo(() => rows.map((row) => row.assigned_user_id), [rows]);
  const identities = useEmployeeIdentities(assignedIds);
  const [openId, setOpenId] = useState<string | null>(null);

  if (!canView) {
    return null;
  }

  if (list.isLoading) return <WorkspaceSkeleton rows={5} />;

  const loaded = rows.length;
  const hasMore = Boolean(list.hasNextPage);
  const customerPhone = customer.phone_e164?.trim() || customer.phone?.trim() || null;

  return (
    <WorkspaceTabFrame
      title={t("dashboard.customerWorkspace.tabs.sms")}
      subtitle={
        loaded
          ? t("dashboard.customerWorkspace.sms.showing", { count: loaded })
          : t("dashboard.customerWorkspace.sms.emptyDescription")
      }
    >
      {customerPhone ? (
        <p className="mb-2 text-[11px] text-muted-foreground" dir="ltr" data-testid="customer-sms-phone">
          {t("dashboard.customerWorkspace.sms.phone", { phone: customerPhone })}
        </p>
      ) : null}

      {loaded === 0 ? (
        <WorkspaceInlineEmpty
          icon={MessageSquareText}
          title={t("dashboard.customerWorkspace.sms.emptyTitle")}
          description={t("dashboard.customerWorkspace.sms.emptyDescription")}
        />
      ) : (
        <div className="divide-y divide-border/60">
          {rows.map((conversation) => (
            <CustomerSmsConversationCard
              key={conversation.id}
              conversation={conversation}
              assignedName={
                identities.data?.get(conversation.assigned_user_id ?? "")?.fullName ?? null
              }
              locale={i18n.language}
              expanded={openId === conversation.id}
              onToggle={() =>
                setOpenId((current) => (current === conversation.id ? null : conversation.id))
              }
            />
          ))}
          {hasMore ? (
            <div className="flex justify-center p-3">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 rounded-lg text-xs"
                disabled={list.isFetchingNextPage}
                onClick={() => void list.fetchNextPage()}
              >
                {list.isFetchingNextPage ? (
                  <Loader2 className="me-1.5 size-3.5 animate-spin" />
                ) : null}
                {t("dashboard.customerWorkspace.sms.loadMore", {
                  count: CUSTOMER_SMS_PAGE_SIZE,
                })}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </WorkspaceTabFrame>
  );
}

function CustomerSmsConversationCard({
  conversation,
  assignedName,
  locale,
  expanded,
  onToggle,
}: {
  conversation: ConversationRecord;
  assignedName: string | null;
  locale: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation("common");
  const direction = resolveCustomerSmsDirection(conversation);
  const phone = resolveCustomerSmsThreadPhone(conversation);
  const href = customerSmsOpenConversationHref(conversation.id);
  const incoming = direction === "incoming";
  const preview = conversation.last_message_preview?.trim() || null;

  return (
    <article className="px-3 py-3" data-testid="customer-sms-conversation-card">
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border",
            incoming
              ? "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300"
              : "border-primary/30 bg-primary/10 text-primary",
          )}
        >
          {incoming ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold" dir="ltr">
              {phone || t("dashboard.customerWorkspace.sms.unknownPhone")}
            </p>
            {direction ? (
              <WorkspaceStatusChip tone={incoming ? "primary" : "success"}>
                {incoming
                  ? t("dashboard.customerWorkspace.sms.incoming")
                  : t("dashboard.customerWorkspace.sms.outgoing")}
              </WorkspaceStatusChip>
            ) : null}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {incoming
              ? t("dashboard.customerWorkspace.sms.flowIncoming")
              : t("dashboard.customerWorkspace.sms.flowOutgoing")}
            <span className="mx-1.5">·</span>
            {formatWhen(conversation.last_message_at, locale)}
          </p>
          {assignedName ? (
            <p className="text-[11px] text-muted-foreground">
              {t("dashboard.customerWorkspace.sms.assignedTo", { name: assignedName })}
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              {t("dashboard.customerWorkspace.sms.unassigned")}
            </p>
          )}
          {preview ? (
            <p className="line-clamp-2 text-xs text-foreground/80">{preview}</p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button asChild type="button" size="sm" variant="outline" className="h-7 rounded-lg text-xs">
              <Link href={href} data-testid="customer-sms-open-conversation">
                {t("dashboard.customerWorkspace.sms.openConversation")}
              </Link>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 rounded-lg text-xs"
              onClick={onToggle}
            >
              <ChevronDown className={cn("me-1 size-3.5 transition-transform", expanded && "rotate-180")} />
              {t("dashboard.customerWorkspace.sms.thread")}
            </Button>
          </div>
          {expanded ? <CustomerSmsThread conversationId={conversation.id} locale={locale} /> : null}
        </div>
      </div>
    </article>
  );
}

function CustomerSmsThread({
  conversationId,
  locale,
}: {
  conversationId: string;
  locale: string;
}) {
  const { t } = useTranslation("common");
  const messages = useCustomerSmsThreadMessages(conversationId, true);
  const actorIds = useMemo(
    () => (messages.data ?? []).map((row) => resolveCustomerSmsMessageActor(row).sentByUserId),
    [messages.data],
  );
  const identities = useEmployeeIdentities(actorIds);

  if (messages.isLoading) {
    return <p className="pt-2 text-xs text-muted-foreground">{t("notifications.loading")}</p>;
  }

  const rows = messages.data ?? [];
  if (rows.length === 0) {
    return (
      <p className="pt-2 text-xs text-muted-foreground">
        {t("dashboard.customerWorkspace.sms.threadEmpty")}
      </p>
    );
  }

  return (
    <ol className="mt-2 space-y-2 border-s border-border/60 ps-3">
      {rows.map((message) => {
        const actor = resolveCustomerSmsMessageActor(message);
        const snippet = customerSmsMessageSnippet(message.content);
        const sentByName = actor.sentByUserId
          ? identities.data?.get(actor.sentByUserId)?.fullName ?? null
          : null;
        const delivery = normalizeCustomerSmsDeliveryStatus(message.status);
        return (
          <li key={message.id} className="space-y-0.5" data-testid="customer-sms-thread-message">
            <div className="flex flex-wrap items-center gap-2">
              <WorkspaceStatusChip tone={actor.direction === "incoming" ? "primary" : "success"}>
                {actor.direction === "incoming"
                  ? t("dashboard.customerWorkspace.sms.incoming")
                  : actor.direction === "outgoing"
                    ? t("dashboard.customerWorkspace.sms.outgoing")
                    : t("dashboard.customerWorkspace.sms.system")}
              </WorkspaceStatusChip>
              {delivery ? (
                <WorkspaceStatusChip tone={delivery === "failed" ? "danger" : "muted"}>
                  {t(`dashboard.customerWorkspace.sms.status.${delivery}`)}
                </WorkspaceStatusChip>
              ) : null}
              <span className="text-[11px] text-muted-foreground">
                {formatWhen(message.created_at, locale)}
              </span>
            </div>
            {sentByName ? (
              <p className="text-[11px] text-muted-foreground">
                {t("dashboard.customerWorkspace.sms.sentBy", { name: sentByName })}
              </p>
            ) : null}
            {snippet ? <p className="text-xs text-foreground/80">{snippet}</p> : null}
          </li>
        );
      })}
    </ol>
  );
}
