import { useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowDownLeft, ArrowUpRight, ChevronDown, Loader2, Mail } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { WorkspaceSkeleton } from "@/components/customer-workspace/workspace-ui";
import {
  WorkspaceInlineEmpty,
  WorkspaceStatusChip,
  WorkspaceTabFrame,
} from "@/components/customer-workspace/workspace-tab-frame";
import {
  useCustomerEmailConversations,
  useCustomerEmailThreadMessages,
} from "@/hooks/customer-workspace/use-customer-email-conversations";
import { useEmployeeIdentities } from "@/hooks/employee-identity/use-employee-identity";
import { useCustomerWorkspaceAccess } from "@/hooks/customer-workspace/use-customer-workspace-access";
import { buildEmailWorkspaceListItemDisplay } from "@/lib/email-workspace/email-workspace-list-item";
import { htmlToPlainText } from "@/lib/email-workspace/email-composer-rich-text";
import {
  CUSTOMER_EMAIL_PAGE_SIZE,
  customerEmailMessageSnippet,
  customerEmailOpenConversationHref,
  readCustomerEmailParticipants,
  resolveCustomerEmailDirection,
  resolveCustomerEmailMessageActor,
} from "@/lib/customer-workspace/customer-email-timeline";
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

export function WorkspaceEmailTab({ customer }: Props) {
  const { t, i18n } = useTranslation("common");
  const access = useCustomerWorkspaceAccess("email");
  const canView = access.isTabAccessible("email");
  const list = useCustomerEmailConversations(canView ? customer.id : null);
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

  return (
    <WorkspaceTabFrame
      title={t("dashboard.customerWorkspace.tabs.email")}
      subtitle={
        loaded
          ? t("dashboard.customerWorkspace.email.showing", { count: loaded })
          : t("dashboard.customerWorkspace.email.emptyDescription")
      }
    >
      {loaded === 0 ? (
        <WorkspaceInlineEmpty
          icon={Mail}
          title={t("dashboard.customerWorkspace.email.emptyTitle")}
          description={t("dashboard.customerWorkspace.email.emptyDescription")}
        />
      ) : (
        <div className="divide-y divide-border/60">
          {rows.map((conversation) => (
            <CustomerEmailConversationCard
              key={conversation.id}
              conversation={conversation}
              customer={customer}
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
                {t("dashboard.customerWorkspace.email.loadMore", {
                  count: CUSTOMER_EMAIL_PAGE_SIZE,
                })}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </WorkspaceTabFrame>
  );
}

function CustomerEmailConversationCard({
  conversation,
  customer,
  assignedName,
  locale,
  expanded,
  onToggle,
}: {
  conversation: ConversationRecord;
  customer: Customer;
  assignedName: string | null;
  locale: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation("common");
  const companyId = customer.company_id ?? conversation.company_id;
  const display = buildEmailWorkspaceListItemDisplay({
    conversation,
    companyId,
    customer: {
      id: customer.id,
      companyId,
      name: customer.name,
      email: customer.email,
    },
    labels: {
      newEmail: t("emailModule.workspace.newEmail", { defaultValue: "New email" }),
      noSubject: t("dashboard.customerWorkspace.email.noSubject"),
    },
  });
  const direction = resolveCustomerEmailDirection(conversation);
  const participants = readCustomerEmailParticipants(conversation.metadata);
  const href = customerEmailOpenConversationHref(conversation.id);
  const incoming = direction === "incoming";

  return (
    <article className="px-3 py-3">
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
            <p className="truncate text-sm font-semibold">
              {display.subject || t("dashboard.customerWorkspace.email.noSubject")}
            </p>
            {direction ? (
              <WorkspaceStatusChip tone={incoming ? "primary" : "success"}>
                {incoming
                  ? t("dashboard.customerWorkspace.email.incoming")
                  : t("dashboard.customerWorkspace.email.outgoing")}
              </WorkspaceStatusChip>
            ) : null}
            {display.status ? (
              <WorkspaceStatusChip tone={display.status === "failed" ? "danger" : "muted"}>
                {t(`dashboard.customerWorkspace.email.status.${display.status}`)}
              </WorkspaceStatusChip>
            ) : null}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {incoming
              ? t("dashboard.customerWorkspace.email.flowIncoming")
              : t("dashboard.customerWorkspace.email.flowOutgoing")}
            <span className="mx-1.5">·</span>
            {formatWhen(display.activityAt, locale)}
          </p>
          <p className="truncate text-xs text-muted-foreground" dir="ltr">
            {participants.from
              ? t("dashboard.customerWorkspace.email.from", { email: participants.from })
              : display.primary}
            {participants.to.length > 0
              ? ` · ${t("dashboard.customerWorkspace.email.to", { email: participants.to.join(", ") })}`
              : null}
          </p>
          {assignedName ? (
            <p className="text-[11px] text-muted-foreground">
              {t("dashboard.customerWorkspace.email.assignedTo", { name: assignedName })}
            </p>
          ) : null}
          {display.preview ? (
            <p className="line-clamp-2 text-xs text-foreground/80">{display.preview}</p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button asChild type="button" size="sm" variant="outline" className="h-7 rounded-lg text-xs">
              <Link href={href} data-testid="customer-email-open-conversation">
                {t("dashboard.customerWorkspace.email.openConversation")}
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
              {t("dashboard.customerWorkspace.email.thread")}
            </Button>
          </div>
          {expanded ? <CustomerEmailThread conversationId={conversation.id} locale={locale} /> : null}
        </div>
      </div>
    </article>
  );
}

function CustomerEmailThread({
  conversationId,
  locale,
}: {
  conversationId: string;
  locale: string;
}) {
  const { t } = useTranslation("common");
  const messages = useCustomerEmailThreadMessages(conversationId, true);
  const actorIds = useMemo(
    () =>
      (messages.data ?? []).map((row) => resolveCustomerEmailMessageActor(row).sentByUserId),
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
        {t("dashboard.customerWorkspace.email.threadEmpty")}
      </p>
    );
  }

  return (
    <ol className="mt-2 space-y-2 border-s border-border/60 ps-3">
      {rows.map((message) => {
        const actor = resolveCustomerEmailMessageActor(message);
        const participants = readCustomerEmailParticipants(message.metadata);
        const snippet = customerEmailMessageSnippet(
          htmlToPlainText(message.content) || message.content,
        );
        const sentByName = actor.sentByUserId
          ? identities.data?.get(actor.sentByUserId)?.fullName ?? null
          : null;
        return (
          <li key={message.id} className="space-y-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <WorkspaceStatusChip tone={actor.direction === "incoming" ? "primary" : "success"}>
                {actor.direction === "incoming"
                  ? t("dashboard.customerWorkspace.email.incoming")
                  : actor.direction === "outgoing"
                    ? t("dashboard.customerWorkspace.email.outgoing")
                    : t("dashboard.customerWorkspace.email.system")}
              </WorkspaceStatusChip>
              <span className="text-[11px] text-muted-foreground">
                {formatWhen(message.created_at, locale)}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground" dir="ltr">
              {participants.from
                ? t("dashboard.customerWorkspace.email.from", { email: participants.from })
                : null}
              {sentByName
                ? ` · ${t("dashboard.customerWorkspace.email.sentBy", { name: sentByName })}`
                : null}
            </p>
            {snippet ? <p className="text-xs text-foreground/80">{snippet}</p> : null}
          </li>
        );
      })}
    </ol>
  );
}
