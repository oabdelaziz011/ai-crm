import { useEffect, useMemo, useState } from "react";
import { Inbox, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/auth-context";
import { ConversationListPanel } from "@/components/conversations/conversation-list-panel";
import { ConversationThreadPanel } from "@/components/conversations/conversation-thread-panel";
import { DashboardErrorBanner, DashboardStatCard } from "@/components/dashboard/ui";
import { useCustomerProfile } from "@/context/customer-profile-context";
import { useConversationList } from "@/hooks/conversations/use-conversation-list";
import { useConversationMessages } from "@/hooks/conversations/use-conversation-messages";
import { useConversationActions } from "@/hooks/conversations/use-conversation-actions";
import { useTeamInboxReply } from "@/hooks/conversations/use-team-inbox-reply";
import { useCustomers } from "@/hooks/use-customers";
import {
  consumeQueuedTeamInboxConversationFocus,
  subscribeTeamInboxConversationFocus,
} from "@/lib/customer-profile/services";

export default function TeamInboxPage() {
  const { t } = useTranslation("common");
  const { profile, user } = useAuth();
  const { openCustomerProfile } = useCustomerProfile();
  const companyId = profile?.company_id ?? null;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "unread" | "mine">("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    return subscribeTeamInboxConversationFocus((conversationId) => {
      setSelectedId(conversationId);
    });
  }, []);

  useEffect(() => {
    const queuedId = consumeQueuedTeamInboxConversationFocus();
    if (queuedId) {
      setSelectedId(queuedId);
    }
  }, []);

  const listFilters = useMemo(() => {
    const base: Parameters<typeof useConversationList>[0] = {
      searchQuery: search.trim() || undefined,
    };
    if (filter === "unread") base.hasEmployeeUnread = true;
    if (filter === "mine" && user?.id) base.assignedUserId = user.id;
    return base;
  }, [filter, search, user?.id]);

  const { data: conversations = [], isLoading, error } = useConversationList(listFilters);
  const { data: customers = [] } = useCustomers();
  const customersById = useMemo(
    () => new Map(customers.map((customer) => [customer.id, customer])),
    [customers],
  );
  const selected =
    (selectedId ? conversations.find((c) => c.id === selectedId) : null) ??
    (!selectedId ? conversations[0] : null) ??
    null;
  const activeId = selected?.id ?? selectedId;

  const { data: messages = [], isLoading: messagesLoading } = useConversationMessages(activeId);
  const { assign, release, close } = useConversationActions(companyId);
  const { sendReply, isSending, error: sendError } = useTeamInboxReply(companyId);

  const unreadTotal = conversations.reduce((sum, c) => sum + c.unread_count_employee, 0);
  const humanActive = conversations.filter((c) => c.state === "transferred_to_human").length;

  return (
    <div className="space-y-6 h-[calc(100vh-8rem)] flex flex-col">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Inbox className="w-6 h-6 text-primary" />
            {t("dashboard.inbox.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t("dashboard.inbox.subtitle")}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
        <DashboardStatCard label={t("dashboard.inbox.stats.open")} value={conversations.length} icon={Inbox} loading={isLoading} />
        <DashboardStatCard label={t("dashboard.inbox.stats.unread")} value={unreadTotal} icon={Inbox} loading={isLoading} />
        <DashboardStatCard label={t("dashboard.inbox.stats.human")} value={humanActive} icon={Inbox} loading={isLoading} />
        <DashboardStatCard
          label={t("dashboard.inbox.stats.channels")}
          value={new Set(conversations.map((c) => c.channel_type)).size}
          icon={Inbox}
          loading={isLoading}
        />
      </div>

      {error && <DashboardErrorBanner message={error.message} />}

      <div className="flex flex-wrap gap-2 shrink-0">
        {(["all", "unread", "mine"] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              filter === key
                ? "bg-primary/15 text-primary border-primary/30"
                : "border-white/10 text-muted-foreground hover:text-foreground"
            }`}
          >
            {t(`dashboard.inbox.filters.${key}`)}
          </button>
        ))}
        <div className="flex-1 min-w-[200px] flex items-center gap-2 bg-black/30 border border-white/5 rounded-xl px-3 py-1.5">
          <Search className="w-3.5 h-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("dashboard.inbox.searchPlaceholder")}
            className="bg-transparent text-sm outline-none flex-1"
          />
        </div>
      </div>

      <div className="grid lg:grid-cols-[340px_1fr] gap-4 flex-1 min-h-0">
        <ConversationListPanel
          conversations={conversations}
          customersById={customersById}
          selectedId={activeId}
          isLoading={isLoading}
          onSelect={setSelectedId}
        />
        <ConversationThreadPanel
          conversation={selected}
          customer={
            selected?.customer_id ? customersById.get(selected.customer_id) : undefined
          }
          messages={messages}
          isLoading={messagesLoading}
          isSending={isSending}
          sendError={sendError}
          onSend={(text) => {
            if (!selected) return;
            void sendReply(
              {
                conversationId: selected.id,
                companyChannelId: selected.company_channel_id,
                channelKey: selected.channel_type,
                externalThreadId: selected.external_thread_id,
              },
              text,
            );
          }}
          onAssign={() => {
            if (!selected || !user?.id) return;
            void assign.mutateAsync({ conversationId: selected.id, assignedUserId: user.id });
          }}
          onRelease={() => {
            if (!selected) return;
            void release.mutateAsync({ conversationId: selected.id });
          }}
          onClose={() => {
            if (!selected) return;
            void close.mutateAsync({ conversationId: selected.id });
          }}
          onViewCustomer={() => {
            if (!selected?.customer_id) return;
            openCustomerProfile({
              customerId: selected.customer_id,
              context: {
                conversationId: selected.id,
                conversationNumber: selected.conversation_number,
                companyId: selected.company_id ?? companyId,
              },
            });
          }}
          actionsPending={assign.isPending || release.isPending || close.isPending}
        />
      </div>
    </div>
  );
}
