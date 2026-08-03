import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/auth-context";
import { DashboardErrorBanner } from "@/components/dashboard/ui";
import { AgentWorkspace } from "@/components/omnichannel/workspace-v2";
import type { ComposePanelHandle } from "@/components/omnichannel/agent-desk/compose-panel";
import type { TeamInboxSendPayload } from "@/hooks/conversations/use-team-inbox-reply";
import { AiAssistantSheet } from "@/components/omnichannel/workspace-v2/ai-assistant-sheet";
import { getAiAssistantLabels } from "@/lib/omnichannel/presentation/ai-assistant-labels";
import { EscalationSheet } from "@/components/omnichannel/escalation-sheet";
import { AssignmentSheet } from "@/components/omnichannel/assignment-sheet";
import { LinkCustomerDialog } from "@/components/omnichannel/link-customer-dialog";
import { ensureLeadForConversation } from "@/lib/identity-platform";
import { ConversationPermissionState } from "@/components/omnichannel/conversation-states";
import { useToast } from "@/hooks/use-toast";
import { useOmnichannelConsole, useOmnichannelCustomerContext } from "@/hooks/omnichannel/use-omnichannel-console";
import { useOmnichannelTenantGuard } from "@/hooks/omnichannel/use-omnichannel-tenant-guard";
import { useOmnichannelEmptyInboxCopy } from "@/hooks/omnichannel/use-omnichannel-empty-inbox-copy";
import { useOmnichannelTenantBannerMessage } from "@/components/omnichannel/tenant/omnichannel-tenant-banner";
import { useInboxViewState } from "@/hooks/omnichannel/use-inbox-view-state";
import { buildEnrichedCustomerRef } from "@/lib/omnichannel/presentation/conversation-contact-identity";
import { resolveUserDisplayName } from "@/lib/omnichannel/presentation/agent-display-name";
import type { Profile } from "@/lib/types";
import { useOmnichannelKeyboardShortcuts } from "@/hooks/omnichannel/use-omnichannel-keyboard-shortcuts";
import {
  useConversationViewLabels,
  useAgentDeskLabels,
  useWorkspaceNavLabels,
  useWorkspaceChromeLabels,
  useIntelligenceSidebarLabels,
} from "@/hooks/omnichannel/use-omnichannel-labels";
import { useConversationLifecycleActions } from "@/hooks/conversations/use-conversation-lifecycle-actions";
import {
  mergeInternalNotesForDisplay,
  useInternalNotesManagement,
} from "@/hooks/conversations/use-internal-notes-management";
import type { OmnichannelListFilters } from "@/lib/omnichannel/types/unified-conversation";
import {
  countWorkspaceNav,
  filtersToWorkspaceNav,
  workspaceNavToFilters,
  type WorkspaceNavId,
} from "@/components/omnichannel/workspace-v2/workspace-nav";
import type { OmnichannelQueueId } from "@/lib/omnichannel/services/conversation-queues";
import { getOperationalProjection, CONVERSATION_LIFECYCLE_PERMISSIONS } from "@/lib/conversation-lifecycle";
import { usePermissions } from "@/hooks/use-rbac";
import { useLifecycleMetadataMigration } from "@/hooks/conversations/use-lifecycle-metadata-migration";
import {
  consumeQueuedTeamInboxConversationFocus,
  subscribeTeamInboxConversationFocus,
} from "@/lib/customer-profile/services";
import {
  omniRenderTrace,
  readOmnichannelSessionStorage,
} from "@/lib/omnichannel/debug/omni-render-audit";
import {
  traceDomRenderProps,
  traceDomRenderStage,
} from "@/lib/omnichannel/debug/omni-dom-render-audit";
import { traceOmniSendEnter, traceOmniSendExit } from "@/lib/omnichannel/debug/omni-send-pipeline-audit";
import { traceReorderStage } from "@/lib/omnichannel/debug/omni-reorder-audit";

const OMNICHANNEL_SESSION_KEY = "omnichannel-console-session";

const DEFAULT_FILTERS: OmnichannelListFilters = {
  sortBy: "last_activity",
  sortDirection: "desc",
  archived: false,
};

function navForAssignmentTarget(
  targetType: "user" | "team" | "department" | "ai_employee" | "queue",
  targetId: string,
): WorkspaceNavId {
  if (targetType === "ai_employee") return "ai";
  if (targetType === "user") return "mine";
  if (targetType === "team" || targetType === "department") return "assigned";
  if (targetType === "queue") {
    const queueNav: Partial<Record<OmnichannelQueueId, WorkspaceNavId>> = {
      unassigned: "inbox",
      mine: "mine",
      escalated: "escalated",
      waiting_customer: "waiting",
      waiting_ai: "ai",
      closed: "closed",
      resolved: "closed",
    };
    return queueNav[targetId as OmnichannelQueueId] ?? "inbox";
  }
  return "inbox";
}

function actorLabelFromUser(
  user: { email?: string | null; id?: string } | null | undefined,
  agentsById: ReadonlyMap<string, { id: string; name: string }>,
  profilesByUserId: ReadonlyMap<string, Profile>,
): string | null {
  if (!user?.id) return null;
  return resolveUserDisplayName(user.id, user.email, agentsById, profilesByUserId).display;
}

function loadOmnichannelSession(): { selectedId: string | null; filters: OmnichannelListFilters } {
  try {
    const raw = sessionStorage.getItem(OMNICHANNEL_SESSION_KEY);
    if (!raw) return { selectedId: null, filters: DEFAULT_FILTERS };
    const parsed = JSON.parse(raw) as {
      selectedId?: string | null;
      filters?: OmnichannelListFilters;
    };
    return {
      selectedId: parsed.selectedId ?? null,
      filters: { ...DEFAULT_FILTERS, ...parsed.filters },
    };
  } catch {
    return { selectedId: null, filters: DEFAULT_FILTERS };
  }
}

export const OmnichannelConsole = memo(function OmnichannelConsole() {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const { user } = useAuth();
  const searchRef = useRef<HTMLInputElement>(null);
  const composeRef = useRef<ComposePanelHandle>(null);
  const initialSession = useMemo(() => loadOmnichannelSession(), []);
  const [selectedId, setSelectedId] = useState<string | null>(initialSession.selectedId);
  const [escalationOpen, setEscalationOpen] = useState(false);
  const [assignmentOpen, setAssignmentOpen] = useState(false);

  const [linkCustomerOpen, setLinkCustomerOpen] = useState(false);
  const [pendingRetry, setPendingRetry] = useState<TeamInboxSendPayload | null>(null);
  const [aiAssistOpen, setAiAssistOpen] = useState(false);
  const [filters, setFilters] = useState<OmnichannelListFilters>(initialSession.filters);

  const intelligenceLabels = useIntelligenceSidebarLabels();
  const viewLabels = useConversationViewLabels();
  const deskLabels = useAgentDeskLabels();
  const navLabels = useWorkspaceNavLabels();
  const chromeLabels = useWorkspaceChromeLabels();

  useEffect(() => subscribeTeamInboxConversationFocus(setSelectedId), []);
  useEffect(() => {
    const queued = consumeQueuedTeamInboxConversationFocus();
    if (queued) setSelectedId(queued);
  }, []);

  useEffect(() => {
    sessionStorage.setItem(
      OMNICHANNEL_SESSION_KEY,
      JSON.stringify({ selectedId, filters }),
    );
  }, [selectedId, filters]);

  const consoleState = useOmnichannelConsole(filters, selectedId);
  const { applyViewState, markConversationViewedById } = useInboxViewState(
    consoleState.inboxConversations,
    initialSession.selectedId,
  );

  const displayConversations = useMemo(
    () => applyViewState(consoleState.conversations),
    [applyViewState, consoleState.conversations],
  );

  const displayInboxConversations = useMemo(
    () => applyViewState(consoleState.inboxConversations),
    [applyViewState, consoleState.inboxConversations],
  );

  useEffect(() => {
    const session = readOmnichannelSessionStorage();
    traceReorderStage({
      stage: "OmnichannelConsole.displayConversations",
      file: "omnichannel-console.tsx",
      function: "OmnichannelConsole",
      line: 159,
      before: consoleState.conversations,
      after: displayConversations,
      arrayReferenceChanged: consoleState.conversations !== displayConversations,
      sortCalled: false,
      extra: { activeNav: filtersToWorkspaceNav(filters), selectedId },
    });
    traceDomRenderProps({
      stage: "OmnichannelConsole.displayConversations.applyViewState",
      file: "omnichannel-console.tsx",
      function: "useMemo(displayConversations)",
      line: 155,
      conversationIdsKey: "displayConversations",
      propsBefore: { displayConversations: consoleState.conversations },
      propsAfter: { displayConversations },
    });
    omniRenderTrace("OmnichannelConsole.displayConversations", displayConversations, {
      activeNav: filtersToWorkspaceNav(filters),
      filters,
      selectedId,
      selectedQueue: filters.queue ?? "all",
      sessionStorage: session,
      sessionStorageFilters: session && typeof session === "object" && "filters" in session ? session.filters : null,
      sessionStorageSelectedId: session && typeof session === "object" && "selectedId" in session ? session.selectedId : null,
    });
    traceDomRenderStage({
      stage: "OmnichannelConsole.displayConversations",
      file: "omnichannel-console.tsx",
      function: "OmnichannelConsole",
      line: 529,
      rows: displayConversations,
      extra: {
        activeNav: filtersToWorkspaceNav(filters),
        selectedId,
        rawVisibleCount: consoleState.conversations.length,
      },
    });
  }, [displayConversations, consoleState.conversations, filters, selectedId]);

  const handleSelectConversation = useCallback(
    (id: string) => {
      markConversationViewedById(id, consoleState.inboxConversations);
      setSelectedId(id);
    },
    [markConversationViewedById, consoleState.inboxConversations],
  );

  useEffect(() => {
    if (selectedId) {
      markConversationViewedById(selectedId, consoleState.inboxConversations);
    }
  }, [selectedId, consoleState.inboxConversations, markConversationViewedById]);
  const lifecycle = useConversationLifecycleActions(consoleState.companyId);
  const notesManagement = useInternalNotesManagement(consoleState.companyId);
  const { hasPermission, isSuperAdmin } = usePermissions();
  const canManageNotes =
    isSuperAdmin || hasPermission(CONVERSATION_LIFECYCLE_PERMISSIONS.internalNotesManage);

  const selected = consoleState.selectedConversation;
  const selectedRecord = selected?.source ?? null;
  const displayMessages = useMemo(
    () => mergeInternalNotesForDisplay(consoleState.messages, selectedRecord?.metadata),
    [consoleState.messages, selectedRecord?.metadata],
  );
  const enrichedCustomer = useMemo(() => buildEnrichedCustomerRef(selected), [selected]);
  const lifecycleSnapshot = lifecycle.snapshot(selectedRecord, {
    customer: enrichedCustomer,
    assignedAgent: selected?.assignedAgent ?? null,
  });
  const customerContext = useOmnichannelCustomerContext(selected?.customer?.id ?? null);

  const aiAssistantLabels = useMemo(
    () => getAiAssistantLabels(consoleState.aiAssist.resolvedLanguage),
    [consoleState.aiAssist.resolvedLanguage],
  );

  const currentActorLabel = useMemo(
    () => actorLabelFromUser(user, consoleState.agentsById, consoleState.profilesByUserId),
    [user, consoleState.agentsById, consoleState.profilesByUserId],
  );

  const operationalState = useMemo(
    () =>
      selectedRecord
        ? getOperationalProjection(selectedRecord)
        : { assignment: null, activeQueue: null, escalations: [] },
    [selectedRecord],
  );

  useLifecycleMetadataMigration(selectedRecord, consoleState.companyId);

  const navCounts = useMemo(
    () => countWorkspaceNav(displayInboxConversations, user?.id),
    [displayInboxConversations, user?.id],
  );

  const navigateToNav = useCallback((nav: WorkspaceNavId) => {
    setFilters((current) => ({ ...current, ...workspaceNavToFilters(nav) }));
  }, []);

  const requireSelected = useCallback(() => {
    if (!selectedRecord) throw new Error("No conversation selected");
    return selectedRecord;
  }, [selectedRecord]);

  const handleAssignTarget = useCallback(
    async (payload: { targetType: "user" | "team" | "department" | "ai_employee" | "queue"; targetId: string; targetLabel: string }) => {
      const record = requireSelected();
      if (!lifecycle.canPerform(record, "assign")) {
        toast({
          title: t("omnichannel.actions.permissionDenied"),
          variant: "destructive",
        });
        return;
      }
      try {
        await lifecycle.assignTo(
          record,
          payload,
          user?.id ?? null,
          currentActorLabel,
        );
        toast({ title: t("omnichannel.actions.assignSuccess") });
        navigateToNav(navForAssignmentTarget(payload.targetType, payload.targetId));
      } catch (error) {
        toast({
          title: t("omnichannel.actions.assignFailed"),
          description: error instanceof Error ? error.message : undefined,
          variant: "destructive",
        });
      }
    },
    [lifecycle, requireSelected, user, currentActorLabel, navigateToNav, toast, t],
  );

  const handleTakeOver = useCallback(async () => {
    if (!user?.id) return;
    try {
      await lifecycle.takeOver(requireSelected(), user.id, currentActorLabel ?? user.id);
      toast({ title: t("omnichannel.actions.takeOverSuccess") });
      navigateToNav("mine");
    } catch (error) {
      toast({
        title: t("omnichannel.actions.takeOverFailed"),
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    }
  }, [lifecycle, requireSelected, user, currentActorLabel, navigateToNav, toast, t]);

  const handleReturnToAi = useCallback(async () => {
    const record = requireSelected();
    if (!lifecycle.canPerform(record, "return_to_ai")) {
      toast({ title: t("omnichannel.actions.permissionDenied"), variant: "destructive" });
      return;
    }
    try {
      await lifecycle.returnToAi(record, user?.id ?? null, currentActorLabel);
      toast({ title: t("omnichannel.actions.returnToAiSuccess") });
      navigateToNav("ai");
    } catch (error) {
      toast({
        title: t("omnichannel.actions.returnToAiFailed"),
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    }
  }, [lifecycle, requireSelected, user, navigateToNav, toast, t]);

  const handleClose = useCallback(async () => {
    const record = requireSelected();
    if (!lifecycle.canPerform(record, "close")) {
      toast({ title: t("omnichannel.actions.permissionDenied"), variant: "destructive" });
      return;
    }
    try {
      await lifecycle.closeConversation(record, currentActorLabel);
      toast({ title: t("omnichannel.actions.closeSuccess") });
      navigateToNav("closed");
    } catch (error) {
      toast({
        title: t("omnichannel.actions.closeFailed"),
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    }
  }, [lifecycle, requireSelected, user, navigateToNav, toast, t]);

  const handleResolve = useCallback(async () => {
    const record = requireSelected();
    if (!lifecycle.canPerform(record, "resolve")) {
      toast({ title: t("omnichannel.actions.permissionDenied"), variant: "destructive" });
      return;
    }
    try {
      await lifecycle.resolveConversation(record, currentActorLabel);
      toast({ title: t("omnichannel.actions.resolveSuccess") });
      navigateToNav("closed");
    } catch (error) {
      toast({
        title: t("omnichannel.actions.resolveFailed"),
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    }
  }, [lifecycle, requireSelected, user, navigateToNav, toast, t]);

  const handleReopen = useCallback(async () => {
    const record = requireSelected();
    if (!lifecycle.canPerform(record, "reopen")) {
      toast({ title: t("omnichannel.actions.permissionDenied"), variant: "destructive" });
      return;
    }
    try {
      await lifecycle.reopenConversation(record, currentActorLabel);
      toast({ title: t("omnichannel.actions.reopenSuccess") });
      navigateToNav("inbox");
    } catch (error) {
      toast({
        title: t("omnichannel.actions.reopenFailed"),
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    }
  }, [lifecycle, requireSelected, user, navigateToNav, toast, t]);

  const handleReturnEscalation = useCallback(async () => {
    const record = requireSelected();
    if (!lifecycle.canPerform(record, "return")) {
      toast({ title: t("omnichannel.actions.permissionDenied"), variant: "destructive" });
      return;
    }
    try {
      await lifecycle.returnEscalation(record, currentActorLabel);
      toast({ title: t("omnichannel.actions.returnEscalationSuccess") });
      navigateToNav("inbox");
    } catch (error) {
      toast({
        title: t("omnichannel.actions.returnEscalationFailed"),
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    }
  }, [lifecycle, requireSelected, user, navigateToNav, toast, t]);

  const handleCancelEscalation = useCallback(async () => {
    const record = requireSelected();
    if (!lifecycle.canPerform(record, "escalation_cancel")) {
      toast({ title: t("omnichannel.actions.permissionDenied"), variant: "destructive" });
      return;
    }
    try {
      await lifecycle.cancelEscalation(record, currentActorLabel);
      toast({ title: t("omnichannel.actions.cancelEscalationSuccess") });
    } catch (error) {
      toast({
        title: t("omnichannel.actions.cancelEscalationFailed"),
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    }
  }, [lifecycle, requireSelected, user, toast, t]);

  const handleEditInternalNote = useCallback(
    async (messageId: string, originalBody: string, nextBody: string) => {
      if (!selectedRecord) return;
      try {
        await notesManagement.editNote({
          record: selectedRecord,
          messageId,
          originalBody,
          nextBody,
          actor: { id: user?.id ?? null, label: currentActorLabel },
        });
        toast({ title: t("omnichannel.sidebar.internalNotesEditSuccess") });
      } catch (error) {
        toast({
          title: t("omnichannel.sidebar.internalNotesEditFailed"),
          description: error instanceof Error ? error.message : undefined,
          variant: "destructive",
        });
        throw error;
      }
    },
    [notesManagement, selectedRecord, user, toast, t],
  );

  const handleDeleteInternalNote = useCallback(
    async (messageId: string) => {
      if (!selectedRecord) return;
      try {
        await notesManagement.deleteNote({
          record: selectedRecord,
          messageId,
          actor: { id: user?.id ?? null, label: currentActorLabel },
        });
        toast({ title: t("omnichannel.sidebar.internalNotesDeleteSuccess") });
      } catch (error) {
        toast({
          title: t("omnichannel.sidebar.internalNotesDeleteFailed"),
          description: error instanceof Error ? error.message : undefined,
          variant: "destructive",
        });
        throw error;
      }
    },
    [notesManagement, selectedRecord, user, toast, t],
  );

  const handleOpenAssignment = useCallback(() => {
    setAssignmentOpen(true);
  }, []);

  const prefilledPhone = typeof selectedRecord?.metadata?.phone === "string" ? selectedRecord.metadata.phone : null;

  const handleCreateLead = useCallback(async () => {
    if (!selectedRecord || !profile?.company_id || !user?.id) return;
    try {
      const identity = await ensureLeadForConversation({
        companyId: profile.company_id,
        actorUserId: user.id,
        conversationId: selectedRecord.id,
        title: selectedRecord.displayName || selectedRecord.lastMessagePreview || "Conversation lead",
        contactName: selectedRecord.displayName ?? undefined,
        phone: prefilledPhone,
      });
      toast({
        title: identity.kind === "lead" ? "Lead created" : "Identity linked",
        description: identity.displayName ?? undefined,
      });
    } catch (error) {
      toast({
        title: "Lead creation failed",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    }
  }, [prefilledPhone, profile?.company_id, selectedRecord, toast, user?.id]);

  useOmnichannelKeyboardShortcuts({
    enabled: consoleState.canView,
    onReply: () => composeRef.current?.focus(),
    onAssign: handleOpenAssignment,
    onClose: handleClose,
    onSearch: () => searchRef.current?.focus(),
  });

  const activeNav = filtersToWorkspaceNav(filters);

  const tenantGuard = useOmnichannelTenantGuard({
    rawRowCount: consoleState.flatRowCount,
    visibleCount: displayConversations.length,
    listLoading: consoleState.listQuery.isLoading,
    activeNav,
    filters,
    selectedConversation: selected,
  });

  const tenantBannerMessage = useOmnichannelTenantBannerMessage(tenantGuard.whatsAppChannelMismatch);

  const explainedEmpty = useOmnichannelEmptyInboxCopy(tenantGuard.emptyDiagnosis, tenantGuard.tenant);

  const inboxEmptyTitle = explainedEmpty?.title ?? t("omnichannel.emptyTitle");
  const inboxEmptyHint = explainedEmpty?.hint ?? t("omnichannel.emptyBody");

  const tenantContext = {
    companyName: tenantGuard.tenant.companyName,
    companyId: tenantGuard.tenant.companyId,
    userEmail: tenantGuard.tenant.userEmail,
    developerMode: tenantGuard.tenant.developerMode,
    companyLabel: t("omnichannel.tenantGuard.companyLabel"),
    signedInLabel: t("omnichannel.tenantGuard.signedInLabel"),
  };

  if (!consoleState.canView) {
    return (
      <ConversationPermissionState
        title={t("omnichannel.noPermissionTitle")}
        description={t("omnichannel.noPermissionBody")}
      />
    );
  }

  const isClosed = lifecycleSnapshot?.state === "CLOSED" || lifecycleSnapshot?.state === "RESOLVED";

  const inboxTitle = navLabels[activeNav] ?? navLabels.inbox;

  return (
    <>
      {consoleState.listQuery.error ? (
        <DashboardErrorBanner message={(consoleState.listQuery.error as Error).message} />
      ) : null}

      <AgentWorkspace
        composeRef={composeRef}
        searchRef={searchRef}
        title={t("omnichannel.title")}
        searchValue={filters.search ?? ""}
        searchPlaceholder={t("omnichannel.searchPlaceholder")}
        onSearchChange={(value) => setFilters((current) => ({ ...current, search: value || undefined }))}
        navLabels={navLabels}
        navCounts={navCounts}
        activeNav={activeNav}
        onNavChange={navigateToNav}
        navAriaLabel={chromeLabels.navAria}
        inboxTitle={inboxTitle}
        conversations={displayConversations}
        selectedId={selected?.id ?? selectedId}
        listLoading={consoleState.listQuery.isLoading}
        hasMore={Boolean(consoleState.listQuery.hasNextPage)}
        onSelectConversation={handleSelectConversation}
        onLoadMore={() => {
          if (consoleState.listQuery.hasNextPage && !consoleState.listQuery.isFetchingNextPage) {
            void consoleState.listQuery.fetchNextPage();
          }
        }}
        inboxEmptyTitle={inboxEmptyTitle}
        inboxEmptyHint={inboxEmptyHint}
        tenantContext={tenantContext}
        tenantBannerMessage={tenantBannerMessage}
        loadingLabel={t("status.loading")}
        rowLabels={{
          visitorLabel: t("omnichannel.visitorLabel"),
          noPreview: t("omnichannel.noPreview"),
          aiEmployee: t("omnichannel.assignment.aiEmployee"),
          unassigned: t("omnichannel.customer.unassigned"),
          open: t("omnichannel.actions.open"),
          pin: t("omnichannel.experience.pinConversation"),
          star: t("omnichannel.experience.starConversation"),
          markUnread: t("omnichannel.experience.markUnread"),
          follow: t("omnichannel.experience.followConversation"),
        }}
        unreadOverflowLabel={deskLabels.unreadOverflow}
        conversation={selected}
        messages={displayMessages}
        aiAssist={consoleState.aiAssist}
        lifecycleSnapshot={lifecycleSnapshot}
        messagesLoading={consoleState.messagesQuery.isLoading}
        isSending={consoleState.isSending}
        sendError={consoleState.sendError}
        onDismissSendError={consoleState.clearSendError}
        actionsPending={lifecycle.isPending}
        escalated={selected?.isEscalated ?? false}
        isClosed={isClosed}
        canPerform={lifecycle.canPerform}
        canLinkCustomer={lifecycle.canLinkCustomer}
        canCreateCustomer={lifecycle.canCreateCustomer}
        viewLabels={viewLabels}
        deskLabels={deskLabels}
        sessionEmptyTitle={viewLabels.selectConversation}
        sessionEmptyHint={viewLabels.sessionEmptyDescription}
        onOpenAiAssistant={() => setAiAssistOpen(true)}
        filters={filters}
        onSend={async (payload) => {
          if (!selected) return false;
          setPendingRetry(payload);
          traceOmniSendEnter({
            layer: 1,
            stage: "OmnichannelConsole.onSend",
            file: "omnichannel-console.tsx",
            function: "onSend",
            line: 613,
            conversationId: selected.id,
            extra: {
              conversationNumber: selected.conversationNumber,
              mode: payload.mode,
            },
          });
          const ok = await consoleState.sendReply(
            {
              conversationId: selected.id,
              companyChannelId: selected.companyChannelId,
              channelKey: selected.channel,
              externalThreadId: selected.externalThreadId,
            },
            payload,
          );
          traceOmniSendExit({
            layer: 1,
            stage: "OmnichannelConsole.onSend",
            success: ok,
            conversationId: selected.id,
            extra: { ok },
          });
          if (ok) {
            setPendingRetry(null);
            consoleState.clearSendError?.();
          }
          return ok;
        }}
        onRetrySend={
          pendingRetry
            ? () => {
                if (!selected || !pendingRetry) return;
                void consoleState.sendReply(
                  {
                    conversationId: selected.id,
                    companyChannelId: selected.companyChannelId,
                    channelKey: selected.channel,
                    externalThreadId: selected.externalThreadId,
                  },
                  pendingRetry,
                ).then((ok) => {
                  if (ok) setPendingRetry(null);
                });
              }
            : undefined
        }
        retrySendLabel={t("omnichannel.composer.retrySend")}
        sessionActions={{
          onTakeOver: handleTakeOver,
          onAssign: handleOpenAssignment,
          onOpenAssignment: handleOpenAssignment,
          onRelease: handleReturnToAi,
          onClose: handleClose,
          onResolve: handleResolve,
          onReopen: handleReopen,
          onEscalate: () => setEscalationOpen(true),
          onReturnConversation: handleReturnEscalation,
          onCancelEscalation: handleCancelEscalation,
          onOpenAiSection: () => setAiAssistOpen(true),
          onCreateCustomer: () => {
            void handleCreateLead();
          },
          onLinkCustomer: () => setLinkCustomerOpen(true),
        }}
        customerContext={customerContext.data ?? null}
        intelligenceLabels={intelligenceLabels}
        agentsById={consoleState.agentsById}
        smartTimeLabels={viewLabels.smartTime}
        profilesByUserId={consoleState.profilesByUserId}
        canManageNotes={canManageNotes}
        onEditInternalNote={canManageNotes ? handleEditInternalNote : undefined}
        onDeleteInternalNote={canManageNotes ? handleDeleteInternalNote : undefined}
        internalNotesManaging={notesManagement.isPending}
      />

      <AiAssistantSheet
        open={aiAssistOpen}
        onOpenChange={setAiAssistOpen}
        model={consoleState.aiAssist}
        hasConversation={Boolean(selected)}
        getDraftText={() => composeRef.current?.getDraft() ?? ""}
        labels={aiAssistantLabels}
        onApplyText={(text) => {
          composeRef.current?.setDraft(text);
          composeRef.current?.focus();
        }}
      />

      <EscalationSheet
        open={escalationOpen}
        currentLevel={operationalState.escalations.at(-1)?.escalateTo ?? null}
        escalationHistory={operationalState.escalations}
        onOpenChange={setEscalationOpen}
        onSubmit={async (payload) => {
          if (!selectedRecord) return;
          if (!lifecycle.canPerform(selectedRecord, "escalate")) {
            toast({ title: t("omnichannel.actions.permissionDenied"), variant: "destructive" });
            return;
          }
          try {
            await lifecycle.escalate(selectedRecord, payload, "escalated", currentActorLabel);
            toast({ title: t("omnichannel.actions.escalateSuccess") });
            navigateToNav("escalated");
            setEscalationOpen(false);
          } catch (error) {
            toast({
              title: t("omnichannel.actions.escalateFailed"),
              description: error instanceof Error ? error.message : undefined,
              variant: "destructive",
            });
          }
        }}
        onReturn={handleReturnEscalation}
        onCancel={handleCancelEscalation}
      />

      <AssignmentSheet
        open={assignmentOpen}
        companyId={consoleState.companyId}
        profiles={consoleState.profiles}
        lifecycleSnapshot={lifecycleSnapshot}
        onOpenChange={setAssignmentOpen}
        onAssign={handleAssignTarget}
      />

      <LinkCustomerDialog
        open={linkCustomerOpen}
        onOpenChange={setLinkCustomerOpen}
        onLink={(customerId, customerName) => {
          if (!selectedRecord) return;
          void lifecycle.linkCustomer.mutateAsync({ record: selectedRecord, customerId, customerName });
        }}
      />
    </>
  );
});
