import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Menu, MessagesSquare, PanelRight } from "lucide-react";

import { useTranslation } from "react-i18next";

import { useAuth } from "@/context/auth-context";

import { DashboardErrorBanner } from "@/components/dashboard/ui";

import { Button } from "@/components/ui/button";

import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

import { CustomerModal } from "@/components/dashboard/customer-modal";

import { ConversationList } from "@/components/omnichannel/conversation-list";

import { ConversationView } from "@/components/omnichannel/conversation-view";

import { WorkspaceSidebar } from "@/components/omnichannel/workspace-sidebar";

import { ConversationFilters, ConversationSearch } from "@/components/omnichannel/conversation-filters";

import { ConversationQueues } from "@/components/omnichannel/conversation-queues";

import { OmnichannelStatsBar } from "@/components/omnichannel/omnichannel-stats-bar";

import { OmnichannelWorkspaceLayout } from "@/components/omnichannel/omnichannel-workspace-layout";

import { EscalationDialog } from "@/components/omnichannel/escalation-dialog";

import { LinkCustomerDialog } from "@/components/omnichannel/link-customer-dialog";

import { OmnichannelPanel } from "@/components/omnichannel/omnichannel-panel";

import {

  ConversationEmptyState,

  ConversationPermissionState,

} from "@/components/omnichannel/conversation-states";

import { useOmnichannelConsole, useOmnichannelCustomerContext } from "@/hooks/omnichannel/use-omnichannel-console";

import { useOmnichannelKeyboardShortcuts } from "@/hooks/omnichannel/use-omnichannel-keyboard-shortcuts";

import {
  useConversationTagOptions,
  useConversationViewLabels,
  useWorkspaceSidebarLabels,
} from "@/hooks/omnichannel/use-omnichannel-labels";

import { useConversationLifecycleActions } from "@/hooks/conversations/use-conversation-lifecycle-actions";

import type { Customer } from "@/lib/types";

import type { OmnichannelListFilters } from "@/lib/omnichannel/types/unified-conversation";

import type { OmnichannelQueueId } from "@/lib/omnichannel/services/conversation-queues";

import { countQueueConversations } from "@/lib/omnichannel/services/conversation-queues";

import { getOperationalProjection } from "@/lib/conversation-lifecycle";
import { useLifecycleMetadataMigration } from "@/hooks/conversations/use-lifecycle-metadata-migration";

import {

  consumeQueuedTeamInboxConversationFocus,

  subscribeTeamInboxConversationFocus,

} from "@/lib/customer-profile/services";



export const OmnichannelConsole = memo(function OmnichannelConsole() {

  const { t } = useTranslation("common");

  const { user } = useAuth();

  const searchRef = useRef<HTMLInputElement>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [escalationOpen, setEscalationOpen] = useState(false);

  const [createCustomerOpen, setCreateCustomerOpen] = useState(false);

  const [linkCustomerOpen, setLinkCustomerOpen] = useState(false);

  const [filters, setFilters] = useState<OmnichannelListFilters>({

    sortBy: "last_activity",

    sortDirection: "desc",

    archived: false,

  });



  const sidebarLabels = useWorkspaceSidebarLabels();

  const viewLabels = useConversationViewLabels();



  useEffect(() => subscribeTeamInboxConversationFocus(setSelectedId), []);

  useEffect(() => {

    const queued = consumeQueuedTeamInboxConversationFocus();

    if (queued) setSelectedId(queued);

  }, []);



  const consoleState = useOmnichannelConsole(filters, selectedId);

  const lifecycle = useConversationLifecycleActions(consoleState.companyId);



  const selected = consoleState.selectedConversation;

  const selectedRecord = selected?.source ?? null;

  const lifecycleSnapshot = lifecycle.snapshot(selectedRecord, {
    customer: selected?.customer ?? null,
    assignedAgent: selected?.assignedAgent ?? null,
  });

  const customerContext = useOmnichannelCustomerContext(selected?.customer?.id ?? null);

  const tagOptions = useConversationTagOptions(consoleState.conversations);



  const operationalState = useMemo(
    () =>
      selectedRecord
        ? getOperationalProjection(selectedRecord)
        : { assignment: null, activeQueue: null, escalations: [] },
    [selectedRecord],
  );

  useLifecycleMetadataMigration(selectedRecord, consoleState.companyId);



  const stats = useMemo(() => {

    const conversations = consoleState.conversations;

    const open = conversations.filter(

      (item) => item.lifecycleState !== "CLOSED" && item.lifecycleState !== "RESOLVED",

    ).length;

    const assigned = conversations.filter((item) => Boolean(item.assignedAgent)).length;

    const waitingCustomer = conversations.filter((item) => item.lifecycleState === "PENDING_CUSTOMER").length;

    const waitingAi = conversations.filter((item) => item.lifecycleState === "AI_HANDLING").length;

    const escalated = conversations.filter((item) => item.isEscalated).length;

    const resolvedToday = conversations.filter(

      (item) => item.lifecycleState === "CLOSED" || item.lifecycleState === "RESOLVED",

    ).length;

    return [

      { key: "open", label: t("omnichannel.stats.open"), value: open, tone: "info" as const },

      { key: "assigned", label: t("omnichannel.stats.assigned"), value: assigned, tone: "default" as const },

      { key: "waitingCustomer", label: t("omnichannel.stats.waitingCustomer"), value: waitingCustomer, tone: "warning" as const },

      { key: "waitingAi", label: t("omnichannel.stats.waitingAi"), value: waitingAi, tone: "muted" as const },

      { key: "escalated", label: t("omnichannel.stats.escalated"), value: escalated, tone: "danger" as const },

      { key: "resolved", label: t("omnichannel.stats.resolvedToday"), value: resolvedToday, tone: "success" as const },

    ];

  }, [consoleState.conversations, t]);



  const queueCounts = useMemo(

    () => countQueueConversations(consoleState.conversations, user?.id),

    [consoleState.conversations, user?.id],

  );



  const queueLabels = useMemo(

    () => ({

      all: t("omnichannel.filters.all"),

      unassigned: t("omnichannel.queues.unassigned"),

      mine: t("omnichannel.queues.mine"),

      team: t("omnichannel.queues.team"),

      waiting_customer: t("omnichannel.queues.waitingCustomer"),

      waiting_ai: t("omnichannel.queues.waitingAi"),

      escalated: t("omnichannel.queues.escalated"),

      closed_24h: t("omnichannel.queues.closedToday"),

    }),

    [t],

  );



  const requireSelected = useCallback(() => {

    if (!selectedRecord) throw new Error("No conversation selected");

    return selectedRecord;

  }, [selectedRecord]);



  const handleAssignTarget = useCallback(

    (payload: {

      targetType: "user" | "team" | "department" | "ai_employee" | "queue";

      targetId: string;

      targetLabel: string;

    }) => {

      void lifecycle.assignTo(requireSelected(), payload, user?.id ?? null);

    },

    [lifecycle, requireSelected, user?.id],

  );



  const handleTakeOver = useCallback(() => {

    if (!user?.id) return;

    void lifecycle.takeOver(requireSelected(), user.id, user.email ?? user.id);

  }, [lifecycle, requireSelected, user]);



  const handleReturnToAi = useCallback(() => {

    void lifecycle.returnToAi(requireSelected(), user?.id ?? null);

  }, [lifecycle, requireSelected, user?.id]);



  const handleClose = useCallback(() => {

    void lifecycle.closeConversation(requireSelected());

  }, [lifecycle, requireSelected]);



  const handleResolve = useCallback(() => {

    void lifecycle.resolveConversation(requireSelected());

  }, [lifecycle, requireSelected]);



  const handleReopen = useCallback(() => {

    void lifecycle.reopenConversation(requireSelected());

  }, [lifecycle, requireSelected]);



  const handleReturnEscalation = useCallback(() => {

    void lifecycle.returnEscalation(requireSelected());

  }, [lifecycle, requireSelected]);



  const handleCancelEscalation = useCallback(() => {

    void lifecycle.cancelEscalation(requireSelected());

  }, [lifecycle, requireSelected]);



  const handleCustomerCreated = useCallback(

    (created: Customer) => {

      if (!selectedRecord) return;

      void lifecycle.linkCustomer.mutateAsync({

        record: selectedRecord,

        customerId: created.id,

        customerName: created.name,

      });

    },

    [lifecycle.linkCustomer, selectedRecord],

  );



  const prefilledPhone =

    typeof selectedRecord?.metadata?.phone === "string" ? selectedRecord.metadata.phone : null;



  useOmnichannelKeyboardShortcuts({

    enabled: consoleState.canView,

    onReply: () => undefined,

    onAssign: handleTakeOver,

    onClose: handleClose,

    onSearch: () => searchRef.current?.focus(),

  });



  if (!consoleState.canView) {

    return (

      <ConversationPermissionState

        title={t("omnichannel.noPermissionTitle")}

        description={t("omnichannel.noPermissionBody")}

      />

    );

  }



  const queuesPanel = (

    <ConversationQueues

      title={t("omnichannel.queues.title")}

      activeQueue={filters.queue}

      counts={queueCounts}

      labels={queueLabels}

      tagsTitle={t("omnichannel.tags.title")}

      tagLabels={tagOptions}

      activeTag={filters.tag}

      onTagChange={(tag) => setFilters((current) => ({ ...current, tag }))}

      onChange={(queue) => {

        setFilters((current) => ({ ...current, queue: queue as OmnichannelQueueId | undefined }));

      }}

    />

  );



  const listPanel = (

    <div className="flex h-full min-h-0 flex-col gap-2">

      <OmnichannelPanel className="shrink-0 gap-2 p-3">

        <ConversationSearch

          ref={searchRef}

          value={filters.search ?? ""}

          placeholder={t("omnichannel.searchPlaceholder")}

          onChange={(search) => setFilters((current) => ({ ...current, search }))}

        />

        <ConversationFilters

          filters={filters}

          currentUserId={user?.id}

          onChange={(patch) => setFilters((current) => ({ ...current, ...patch }))}

          labels={{

            all: t("omnichannel.filters.all"),

            unread: t("omnichannel.filters.unread"),

            mine: t("omnichannel.filters.mine"),

            assigned: t("omnichannel.filters.assigned"),

            ai: t("omnichannel.filters.ai"),

            pinned: t("omnichannel.filters.pinned"),

            archived: t("omnichannel.filters.archived"),

            tags: t("omnichannel.filters.tags"),

            whatsapp: t("omnichannel.channels.whatsapp"),

            email: t("omnichannel.channels.email"),

            messenger: t("omnichannel.channels.messenger"),

            instagram: t("omnichannel.channels.instagram"),

          }}

        />

      </OmnichannelPanel>

      <ConversationList

        title={t("omnichannel.listTitle")}

        subtitle={t("omnichannel.listSubtitle")}

        conversations={consoleState.conversations}

        selectedId={selected?.id ?? selectedId}

        isLoading={consoleState.listQuery.isLoading}

        emptyLabel={t("omnichannel.emptyTitle")}

        loadingLabel={t("status.loading")}

        unknownContactLabel={t("omnichannel.unknownContact")}

        noPreviewLabel={t("omnichannel.noPreview")}

        aiLabel={t("omnichannel.ai")}

        humanLabel={t("omnichannel.human")}

        escalatedLabel={t("omnichannel.escalatedBadge")}

        onSelect={setSelectedId}

        onLoadMore={() => {

          if (consoleState.listQuery.hasNextPage && !consoleState.listQuery.isFetchingNextPage) {

            void consoleState.listQuery.fetchNextPage();

          }

        }}

        hasMore={consoleState.listQuery.hasNextPage}

      />

    </div>

  );



  const isClosed =

    lifecycleSnapshot?.state === "CLOSED" || lifecycleSnapshot?.state === "RESOLVED";



  const conversationPanel = (

    <ConversationView

      conversation={selected}

      messages={consoleState.messages}

      aiAssist={consoleState.aiAssist}

      lifecycleSnapshot={lifecycleSnapshot}

      isLoading={consoleState.messagesQuery.isLoading}

      isSending={consoleState.isSending}

      sendError={consoleState.sendError}

      assignedToMe={selected?.assignedAgent?.id === user?.id}

      actionsPending={lifecycle.isPending}

      escalated={selected?.isEscalated ?? false}

      ownerLabel={lifecycleSnapshot?.owner.label ?? selected?.ownerLabel ?? null}

      canPerform={lifecycle.canPerform}

      canLinkCustomer={lifecycle.canLinkCustomer}

      canCreateCustomer={lifecycle.canCreateCustomer}

      labels={viewLabels}

      onSend={({ text, mode }) => {

        if (!selected) return;

        void consoleState.sendReply(

          {

            conversationId: selected.id,

            companyChannelId: selected.companyChannelId,

            channelKey: selected.channel,

            externalThreadId: selected.externalThreadId,

          },

          text,

          mode,

        );

      }}

      onAssign={handleTakeOver}

      onRelease={handleReturnToAi}

      onClose={handleClose}

      onResolve={handleResolve}

      onReopen={handleReopen}

      onEscalate={() => setEscalationOpen(true)}

      onReturnConversation={handleReturnEscalation}

      onCancelEscalation={handleCancelEscalation}

      onOpenAiSection={() => setSidebarOpen(true)}

      onCreateCustomer={() => setCreateCustomerOpen(true)}

      onLinkCustomer={() => setLinkCustomerOpen(true)}

      isClosed={isClosed}

    />

  );



  const sidebarPanel = (

    <WorkspaceSidebar

      conversation={selected}

      messages={consoleState.messages}

      context={customerContext.data ?? null}

      aiAssist={consoleState.aiAssist}

      profiles={consoleState.profiles}

      lifecycleSnapshot={lifecycleSnapshot}

      operationalState={operationalState}

      labels={sidebarLabels}

      onAssignTarget={handleAssignTarget}

      onReturnEscalation={handleReturnEscalation}

    />

  );



  return (

    <div className="flex h-[calc(100vh-5.5rem)] flex-col gap-4">

      <header className="flex shrink-0 flex-col gap-3">

        <div className="flex flex-wrap items-center justify-between gap-3">

          <div>

            <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">

              <MessagesSquare className="size-5 text-primary" aria-hidden />

              {t("omnichannel.title")}

            </h1>

            <p className="mt-0.5 text-xs text-muted-foreground">{t("omnichannel.subtitle")}</p>

          </div>

          <div className="flex items-center gap-2 xl:hidden">

            <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>

              <SheetTrigger asChild>

                <Button variant="outline" size="sm">

                  <Menu className="size-4" />

                </Button>

              </SheetTrigger>

              <SheetContent side="left" className="w-[92vw] max-w-md p-3">

                <div className="grid h-full gap-3 md:grid-cols-2">

                  {queuesPanel}

                  {listPanel}

                </div>

              </SheetContent>

            </Sheet>

            <Button variant="outline" size="sm" onClick={() => setSidebarOpen(true)}>

              <PanelRight className="size-4" />

            </Button>

          </div>

        </div>

        <OmnichannelStatsBar items={stats} loading={consoleState.listQuery.isLoading} />

      </header>



      {consoleState.listQuery.error ? (

        <DashboardErrorBanner message={(consoleState.listQuery.error as Error).message} />

      ) : null}



      {!consoleState.listQuery.isLoading && consoleState.conversations.length === 0 ? (

        <ConversationEmptyState title={t("omnichannel.emptyTitle")} description={t("omnichannel.emptyBody")} />

      ) : (

        <OmnichannelWorkspaceLayout

          queues={queuesPanel}

          list={listPanel}

          conversation={conversationPanel}

          sidebar={sidebarPanel}

        />

      )}



      <EscalationDialog

        open={escalationOpen}

        currentLevel={operationalState.escalations.at(-1)?.escalateTo ?? null}

        onOpenChange={setEscalationOpen}

        onSubmit={(payload) => {

          if (!selectedRecord) return;

          void lifecycle.escalate(selectedRecord, payload, filters.queue ?? "escalated");

          setFilters((current) => ({ ...current, queue: "escalated" }));

        }}

      />



      <LinkCustomerDialog

        open={linkCustomerOpen}

        onOpenChange={setLinkCustomerOpen}

        onLink={(customerId, customerName) => {

          if (!selectedRecord) return;

          void lifecycle.linkCustomer.mutateAsync({ record: selectedRecord, customerId, customerName });

        }}

      />



      <CustomerModal

        open={createCustomerOpen}

        onClose={() => setCreateCustomerOpen(false)}

        defaultPhone={prefilledPhone}

        onCreated={handleCustomerCreated}

      />



      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>

        <SheetContent side="right" className="w-[92vw] max-w-sm p-0 xl:hidden">

          <WorkspaceSidebar

            embedded

            conversation={selected}

            messages={consoleState.messages}

            context={customerContext.data ?? null}

            aiAssist={consoleState.aiAssist}

            profiles={consoleState.profiles}

            lifecycleSnapshot={lifecycleSnapshot}

            operationalState={operationalState}

            labels={sidebarLabels}

            onAssignTarget={handleAssignTarget}

            onReturnEscalation={handleReturnEscalation}

          />

        </SheetContent>

      </Sheet>

    </div>

  );

});


