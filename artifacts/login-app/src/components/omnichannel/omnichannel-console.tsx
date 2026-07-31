import { memo, useEffect, useMemo, useState } from "react";
import { MessagesSquare } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/auth-context";
import { DashboardErrorBanner, DashboardStatCard } from "@/components/dashboard/ui";
import { ConversationList } from "@/components/omnichannel/conversation-list";
import { ConversationView } from "@/components/omnichannel/conversation-view";
import { CustomerSidebar } from "@/components/omnichannel/customer-sidebar";
import { ConversationFilters, ConversationSearch } from "@/components/omnichannel/conversation-filters";
import {
  ConversationEmptyState,
  ConversationPermissionState,
} from "@/components/omnichannel/conversation-states";
import { useOmnichannelConsole, useOmnichannelCustomerContext } from "@/hooks/omnichannel/use-omnichannel-console";
import type { OmnichannelListFilters } from "@/lib/omnichannel/types/unified-conversation";
import {
  consumeQueuedTeamInboxConversationFocus,
  subscribeTeamInboxConversationFocus,
} from "@/lib/customer-profile/services";

export const OmnichannelConsole = memo(function OmnichannelConsole() {
  const { t } = useTranslation("common");
  const { user } = useAuth();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filters, setFilters] = useState<OmnichannelListFilters>({
    sortBy: "last_activity",
    sortDirection: "desc",
    archived: false,
  });

  useEffect(() => subscribeTeamInboxConversationFocus(setSelectedId), []);
  useEffect(() => {
    const queued = consumeQueuedTeamInboxConversationFocus();
    if (queued) setSelectedId(queued);
  }, []);

  const consoleState = useOmnichannelConsole(filters, selectedId);
  const customerContext = useOmnichannelCustomerContext(consoleState.selectedConversation?.customer?.id ?? null);

  const stats = useMemo(() => ({
    open: consoleState.conversations.length,
    unread: consoleState.conversations.reduce((sum, item) => sum + item.unreadCount, 0),
    human: consoleState.conversations.filter((item) => item.handlerMode === "human").length,
    channels: new Set(consoleState.conversations.map((item) => item.channel)).size,
  }), [consoleState.conversations]);

  if (!consoleState.canView) {
    return (
      <ConversationPermissionState
        title={t("omnichannel.noPermissionTitle")}
        description={t("omnichannel.noPermissionBody")}
      />
    );
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-6">
      <div className="shrink-0">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <MessagesSquare className="size-6 text-primary" />
          {t("omnichannel.title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("omnichannel.subtitle")}</p>
      </div>

      <div className="grid shrink-0 grid-cols-2 gap-4 lg:grid-cols-4">
        <DashboardStatCard label={t("omnichannel.stats.open")} value={stats.open} icon={MessagesSquare} loading={consoleState.listQuery.isLoading} />
        <DashboardStatCard label={t("omnichannel.stats.unread")} value={stats.unread} icon={MessagesSquare} loading={consoleState.listQuery.isLoading} />
        <DashboardStatCard label={t("omnichannel.stats.human")} value={stats.human} icon={MessagesSquare} loading={consoleState.listQuery.isLoading} />
        <DashboardStatCard label={t("omnichannel.stats.channels")} value={stats.channels} icon={MessagesSquare} loading={consoleState.listQuery.isLoading} />
      </div>

      {consoleState.listQuery.error ? (
        <DashboardErrorBanner message={(consoleState.listQuery.error as Error).message} />
      ) : null}

      <div className="flex flex-wrap gap-2">
        <ConversationFilters
          filters={filters}
          currentUserId={user?.id}
          onChange={(patch) => setFilters((current) => ({ ...current, ...patch }))}
          labels={{
            all: t("omnichannel.filters.all"),
            unread: t("omnichannel.filters.unread"),
            mine: t("omnichannel.filters.mine"),
            pinned: t("omnichannel.filters.pinned"),
            archived: t("omnichannel.filters.archived"),
            whatsapp: t("omnichannel.channels.whatsapp"),
            email: t("omnichannel.channels.email"),
            messenger: t("omnichannel.channels.messenger"),
            instagram: t("omnichannel.channels.instagram"),
          }}
        />
        <ConversationSearch
          value={filters.search ?? ""}
          placeholder={t("omnichannel.searchPlaceholder")}
          onChange={(search) => setFilters((current) => ({ ...current, search }))}
        />
      </div>

      {!consoleState.listQuery.isLoading && consoleState.conversations.length === 0 ? (
        <ConversationEmptyState
          title={t("omnichannel.emptyTitle")}
          description={t("omnichannel.emptyBody")}
        />
      ) : (
        <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[340px_minmax(0,1fr)_300px]">
          <ConversationList
            title={t("omnichannel.listTitle")}
            subtitle={t("omnichannel.listSubtitle")}
            conversations={consoleState.conversations}
            selectedId={consoleState.selectedConversation?.id ?? selectedId}
            isLoading={consoleState.listQuery.isLoading}
            emptyLabel={t("omnichannel.emptyTitle")}
            loadingLabel={t("status.loading")}
            unknownContactLabel={t("omnichannel.unknownContact")}
            noPreviewLabel={t("omnichannel.noPreview")}
            aiLabel={t("omnichannel.ai")}
            humanLabel={t("omnichannel.human")}
            onSelect={setSelectedId}
            onLoadMore={() => {
              if (consoleState.listQuery.hasNextPage && !consoleState.listQuery.isFetchingNextPage) {
                void consoleState.listQuery.fetchNextPage();
              }
            }}
            hasMore={consoleState.listQuery.hasNextPage}
          />

          <ConversationView
            conversation={consoleState.selectedConversation}
            messages={consoleState.messages}
            aiAssist={consoleState.aiAssist}
            isLoading={consoleState.messagesQuery.isLoading}
            isSending={consoleState.isSending}
            sendError={consoleState.sendError}
            assignedToMe={consoleState.selectedConversation?.assignedAgent?.id === user?.id}
            actionsPending={
              consoleState.assign.isPending
              || consoleState.release.isPending
              || consoleState.close.isPending
            }
            labels={{
              selectConversation: t("omnichannel.selectConversation"),
              loading: t("status.loading"),
              typingPlaceholder: t("omnichannel.typingPlaceholder"),
              reply: t("omnichannel.composer.reply"),
              internalNote: t("omnichannel.composer.internalNote"),
              send: t("omnichannel.composer.send"),
              templates: t("omnichannel.composer.templates"),
              variables: t("omnichannel.composer.variables"),
              voicePlaceholder: t("omnichannel.composer.voicePlaceholder"),
              aiAssistTitle: t("omnichannel.aiAssist.title"),
              summary: t("omnichannel.aiAssist.summary"),
              sentiment: t("omnichannel.aiAssist.sentiment"),
              knowledge: t("omnichannel.aiAssist.knowledge"),
              escalation: t("omnichannel.aiAssist.escalation"),
              translation: t("omnichannel.aiAssist.translation"),
              takeover: t("omnichannel.actions.takeover"),
              release: t("omnichannel.actions.release"),
              close: t("omnichannel.actions.close"),
              ai: t("omnichannel.ai"),
              human: t("omnichannel.human"),
              composerPlaceholder: t("omnichannel.composer.placeholder"),
            }}
            onSend={({ text }) => {
              const selected = consoleState.selectedConversation;
              if (!selected) return;
              void consoleState.sendReply(
                {
                  conversationId: selected.id,
                  companyChannelId: selected.companyChannelId,
                  channelKey: selected.channel,
                  externalThreadId: selected.externalThreadId,
                },
                text,
              );
            }}
            onAssign={() => {
              const selected = consoleState.selectedConversation;
              if (!selected || !user?.id) return;
              void consoleState.assign.mutateAsync({
                conversationId: selected.id,
                assignedUserId: user.id,
              });
            }}
            onRelease={() => {
              const selected = consoleState.selectedConversation;
              if (!selected) return;
              void consoleState.release.mutateAsync({ conversationId: selected.id });
            }}
            onClose={() => {
              const selected = consoleState.selectedConversation;
              if (!selected) return;
              void consoleState.close.mutateAsync({ conversationId: selected.id });
            }}
          />

          <CustomerSidebar
            conversation={consoleState.selectedConversation}
            context={customerContext.data ?? null}
            profileLabel={t("omnichannel.sidebar.profile")}
            timelineLabel={t("omnichannel.sidebar.timeline")}
            bookingsLabel={t("omnichannel.sidebar.bookings")}
            invoicesLabel={t("omnichannel.sidebar.invoices")}
            ticketsLabel={t("omnichannel.sidebar.tickets")}
            knowledgeLabel={t("omnichannel.sidebar.knowledge")}
            aiActionsLabel={t("omnichannel.sidebar.aiActions")}
            emptyLabel={t("omnichannel.sidebar.empty")}
          />
        </div>
      )}
    </div>
  );
});
