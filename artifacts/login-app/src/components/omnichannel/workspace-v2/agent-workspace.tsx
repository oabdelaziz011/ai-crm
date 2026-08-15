import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useLocation } from "wouter";

import { customerWorkspaceHref } from "@/lib/customer-workspace/customer-workspace-utils";

import { agentDetailDashboardHref } from "@/config/agents-route-registry";

import { nestedSectionHref } from "@/lib/routing";

import "@/components/omnichannel/workspace-v2/workspace.css";

import { WorkspaceTopBar, type WorkspaceTenantContext } from "@/components/omnichannel/workspace-v2/workspace-top-bar";
import { OmnichannelTenantBanner } from "@/components/omnichannel/tenant/omnichannel-tenant-banner";

import { WorkspaceNavRail } from "@/components/omnichannel/workspace-v2/workspace-nav-rail";

import { InboxColumn } from "@/components/omnichannel/workspace-v2/inbox-column";

import { InboxResizeHandle } from "@/components/omnichannel/workspace-v2/inbox-resize-handle";

import { ConversationPane } from "@/components/omnichannel/workspace-v2/conversation-pane";

import {

  ConversationIntelligenceSidebar,

  type IntelligenceSidebarTab,

} from "@/components/omnichannel/workspace-v2/conversation-intelligence-sidebar";

import type { ConversationIntelligenceSidebarLabels } from "@/components/omnichannel/workspace-v2/conversation-intelligence-sidebar";

import { useWorkspaceLayout } from "@/components/omnichannel/workspace-v2/use-workspace-layout";

import { useInboxPanelWidth } from "@/components/omnichannel/workspace-v2/use-inbox-panel-width";

import { useConversationExpand } from "@/components/omnichannel/workspace-v2/use-conversation-expand";

import {
  isDeskSoundEnabled,
  subscribeDeskPreferences,
  toggleDeskSoundEnabled,
} from "@/lib/omnichannel/presentation/desk-notification-sound";

import { type WorkspaceNavId } from "@/components/omnichannel/workspace-v2/workspace-nav";
import { omniRenderTrace } from "@/lib/omnichannel/debug/omni-render-audit";
import { traceDomRenderStage } from "@/lib/omnichannel/debug/omni-dom-render-audit";
import { traceReorderStage } from "@/lib/omnichannel/debug/omni-reorder-audit";

import type { OutboundSendError } from "@/hooks/conversations/use-team-inbox-reply";

import type { ComposePanelHandle } from "@/components/omnichannel/agent-desk/compose-panel";

import type { ComposerSendPayload } from "@/lib/omnichannel/types/composer-enterprise-types";

import type { AgentDeskLabels, ConversationViewLabels } from "@/components/omnichannel/types/workspace-labels";

import type {

  OmnichannelAiAssistModel,

  OmnichannelCustomerContext,

  OmnichannelListFilters,

  UnifiedConversation,

  UnifiedMessage,

} from "@/lib/omnichannel/types/unified-conversation";

import type { LifecycleSnapshot, LifecycleAction } from "@/lib/conversation-lifecycle";

import type { ConversationRecord } from "@workspace/ai-conversation";

import type { Profile } from "@/lib/types";

import type { OmnichannelAgentRef } from "@/lib/omnichannel/types/unified-conversation";



export type AgentWorkspaceProps = {

  composeRef?: React.RefObject<ComposePanelHandle | null>;

  searchRef?: React.RefObject<HTMLInputElement | null>;

  title: string;

  searchValue: string;

  searchPlaceholder: string;

  onSearchChange: (value: string) => void;

  navLabels: Record<WorkspaceNavId, string>;

  navCounts: Record<WorkspaceNavId, number>;

  activeNav: WorkspaceNavId;

  onNavChange: (nav: WorkspaceNavId) => void;

  navAriaLabel: string;

  inboxTitle: string;

  conversations: UnifiedConversation[];

  selectedId: string | null;

  listLoading: boolean;

  hasMore: boolean;

  onSelectConversation: (id: string) => void;

  onLoadMore: () => void;

  inboxEmptyTitle: string;

  inboxEmptyHint: string;

  loadingLabel: string;

  rowLabels: {

    visitorLabel: string;

    noPreview: string;

    aiEmployee: string;

    unassigned: string;

    open: string;

    newBadge?: string;

    pin?: string;

    star?: string;

    markUnread?: string;

    follow?: string;

  };

  unreadOverflowLabel: string;

  tenantContext?: WorkspaceTenantContext | null;

  tenantBannerMessage?: string | null;

  conversation: UnifiedConversation | null;

  messages: UnifiedMessage[];

  aiAssist: OmnichannelAiAssistModel;

  lifecycleSnapshot?: LifecycleSnapshot | null;

  messagesLoading: boolean;

  isSending: boolean;

  sendError: OutboundSendError | null;

  onDismissSendError?: () => void;

  actionsPending: boolean;

  escalated?: boolean;

  isClosed?: boolean;

  canPerform?: (record: ConversationRecord, action: LifecycleAction) => boolean;

  canLinkCustomer?: boolean;

  canCreateCustomer?: boolean;

  viewLabels: ConversationViewLabels;

  deskLabels: AgentDeskLabels;

  sessionEmptyTitle: string;

  sessionEmptyHint: string;

  translateDisabledReason?: string;

  onOpenAiAssistant?: () => void;

  onSend: (payload: ComposerSendPayload) => void | Promise<boolean>;

  onRetrySend?: () => void;

  retrySendLabel?: string;

  sessionActions: {

    onTakeOver: () => void;

    onAssign: () => void;

    onOpenAssignment: () => void;

    onRelease: () => void;

    onClose: () => void;

    onResolve?: () => void;

    onReopen?: () => void;

    onEscalate: () => void;

    onReturnConversation: () => void;

    onCancelEscalation: () => void;

    onOpenAiSection: () => void;

    onCreateCustomer?: () => void;

    onLinkCustomer?: () => void;

    onTranslate?: () => void;

  };

  customerContext: OmnichannelCustomerContext | null;

  intelligenceLabels: ConversationIntelligenceSidebarLabels;

  agentsById?: ReadonlyMap<string, OmnichannelAgentRef>;

  profilesByUserId?: ReadonlyMap<string, Profile>;

  canManageNotes?: boolean;

  onEditInternalNote?: (messageId: string, originalBody: string, nextBody: string) => Promise<void>;

  onDeleteInternalNote?: (messageId: string) => Promise<void>;

  internalNotesManaging?: boolean;

  smartTimeLabels?: {

    justNow: string;

    minutesAgo: (count: number) => string;

    yesterday: string;

  };

  filters: OmnichannelListFilters;

};



export const AgentWorkspace = memo(function AgentWorkspace(props: AgentWorkspaceProps) {

  const [, setLocation] = useLocation();

  const intelligenceScrollRef = useRef<HTMLDivElement>(null);

  const { layout, setIntelligenceOpen, toggleIntelligence, setMobileView } = useWorkspaceLayout();

  const {
    resizeEnabled: inboxResizeEnabled,
    startResize: startInboxResize,
    bodyRef: workspaceBodyRef,
    getBody: getWorkspaceBody,
  } = useInboxPanelWidth();

  const { conversationExpanded, toggleConversationExpanded } = useConversationExpand(getWorkspaceBody);

  const [soundEnabled, setSoundEnabled] = useState(isDeskSoundEnabled);

  useEffect(() => subscribeDeskPreferences(() => setSoundEnabled(isDeskSoundEnabled())), []);

  const handleToggleSound = useCallback(() => {
    setSoundEnabled(toggleDeskSoundEnabled());
  }, []);

  const handleToggleExpand = useCallback(() => {
    toggleConversationExpanded();
    // Re-sync inbox resize enablement after expand attribute changes.
    window.dispatchEvent(new Event("resize"));
  }, [toggleConversationExpanded]);

  const deskChrome = useMemo(
    () => ({
      soundEnabled,
      soundOnLabel: props.deskLabels.soundOn,
      soundOffLabel: props.deskLabels.soundOff,
      onToggleSound: handleToggleSound,
      conversationExpanded,
      expandLabel: props.deskLabels.expandConversation,
      collapseLabel: props.deskLabels.collapseConversation,
      onToggleExpand: handleToggleExpand,
    }),
    [
      soundEnabled,
      conversationExpanded,
      handleToggleSound,
      handleToggleExpand,
      props.deskLabels.soundOn,
      props.deskLabels.soundOff,
      props.deskLabels.expandConversation,
      props.deskLabels.collapseConversation,
    ],
  );

  const [intelligenceFocusTab, setIntelligenceFocusTab] = useState<IntelligenceSidebarTab | null>(null);



  const handleNavChange = useCallback(

    (nav: WorkspaceNavId) => {

      props.onNavChange(nav);

      setMobileView("list");

    },

    [props, setMobileView],

  );



  const handleSelectConversation = useCallback(

    (id: string) => {

      props.onSelectConversation(id);

      setMobileView("conversation");

    },

    [props, setMobileView],

  );



  const handleOpenIntelligenceCrm = useCallback(() => {

    setIntelligenceOpen(true);

    setIntelligenceFocusTab("crm");

    intelligenceScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });

  }, [setIntelligenceOpen]);



  const handleNavigateToAssignee = useCallback(

    (userId: string) => {

      setLocation(`/dashboard/users?highlight=${encodeURIComponent(userId)}`);

    },

    [setLocation],

  );



  const handleNavigateToAiEmployee = useCallback(

    (aiEmployeeId: string) => {

      setLocation(nestedSectionHref(agentDetailDashboardHref(aiEmployeeId)));

    },

    [setLocation],

  );



  const handleAvatarClick = useCallback(() => {

    const customerId = props.conversation?.customer?.id;

    if (customerId) {

      setLocation(customerWorkspaceHref(customerId));

      return;

    }

    handleOpenIntelligenceCrm();

  }, [props.conversation?.customer?.id, handleOpenIntelligenceCrm, setLocation]);



  const handleOpenAiSection = useCallback(() => {

    props.onOpenAiAssistant?.();

  }, [props.onOpenAiAssistant]);



  const mobileClass =

    layout.mobileView === "conversation" ? "ws-layout--mobile-conversation" : "ws-layout--mobile-list";

  useEffect(() => {
    omniRenderTrace("AgentWorkspace", props.conversations, {
      activeNav: props.activeNav,
      selectedId: props.selectedId,
      listLoading: props.listLoading,
      mobileView: layout.mobileView,
      mobileClass,
    });
    traceReorderStage({
      stage: "AgentWorkspace",
      file: "agent-workspace.tsx",
      function: "AgentWorkspace",
      line: 374,
      before: props.conversations,
      after: props.conversations,
      arrayReferenceChanged: false,
      sortCalled: false,
      extra: {
        activeNav: props.activeNav,
        selectedId: props.selectedId,
        listLoading: props.listLoading,
        mobileView: layout.mobileView,
        mobileClass,
      },
    });
    traceDomRenderStage({
      stage: "AgentWorkspace.propsToInboxColumn",
      file: "agent-workspace.tsx",
      function: "AgentWorkspace",
      line: 425,
      rows: props.conversations,
      extra: {
        activeNav: props.activeNav,
        selectedId: props.selectedId,
        listLoading: props.listLoading,
        mobileView: layout.mobileView,
        mobileClass,
      },
    });
  }, [props.conversations, props.activeNav, props.selectedId, props.listLoading, layout.mobileView, mobileClass]);



  return (

    <div className={`agent-workspace flex h-full min-h-0 flex-col overflow-hidden ${mobileClass}`}>

      <WorkspaceTopBar

        ref={props.searchRef}

        title={props.title}

        searchValue={props.searchValue}

        searchPlaceholder={props.searchPlaceholder}

        onSearchChange={props.onSearchChange}

        tenant={props.tenantContext}

        deskChrome={deskChrome}

      />

      {props.tenantBannerMessage ? (
        <OmnichannelTenantBanner message={props.tenantBannerMessage} />
      ) : null}



      {/* Physical LTR shell: CRM | Conversation | Inbox — never stack on desktop */}
      <div ref={workspaceBodyRef} className="ws-workspace-body flex min-h-0 flex-1 overflow-hidden" dir="ltr">

        <WorkspaceNavRail

          activeNav={props.activeNav}

          onNavChange={handleNavChange}

          counts={props.navCounts}

          labels={props.navLabels}

          ariaLabel={props.navAriaLabel}

        />



        <div ref={intelligenceScrollRef} className="contents">

          <ConversationIntelligenceSidebar

            open={layout.intelligenceOpen}

            onToggle={toggleIntelligence}

            conversation={props.conversation}

            messages={props.messages}

            lifecycleSnapshot={props.lifecycleSnapshot}

            customerContext={props.customerContext}

            aiAssist={props.aiAssist}

            agentsById={props.agentsById}

            profilesByUserId={props.profilesByUserId}

            smartTimeLabels={

              props.smartTimeLabels ?? {

                justNow: "Just now",

                minutesAgo: (count) => `${count}m ago`,

                yesterday: "Yesterday",

              }

            }

            labels={props.intelligenceLabels}

            supportAgentFallback={props.deskLabels.notAvailable}

            slaLabels={{

              remainingMinutes: props.viewLabels.slaRemainingMinutes,

              remainingHours: props.viewLabels.slaRemainingHours,

              breached: props.viewLabels.slaBreached,

              notSet: props.viewLabels.noSla,

            }}

            focusTab={intelligenceFocusTab}

            onFocusTabHandled={() => setIntelligenceFocusTab(null)}

            onNavigateToAssignee={handleNavigateToAssignee}

            onNavigateToAiEmployee={handleNavigateToAiEmployee}

            onLinkCustomer={props.sessionActions.onLinkCustomer}

            onCreateCustomer={props.sessionActions.onCreateCustomer}

          />

        </div>



        <ConversationPane

          composeRef={props.composeRef}

          conversation={props.conversation}

          messages={props.messages}

          aiAssist={props.aiAssist}

          lifecycleSnapshot={props.lifecycleSnapshot}

          isLoading={props.messagesLoading}

          isSending={props.isSending}

          sendError={props.sendError}

          onDismissSendError={props.onDismissSendError}

          actionsPending={props.actionsPending}

          escalated={props.escalated}

          isClosed={props.isClosed}

          canPerform={props.canPerform}

          canLinkCustomer={props.canLinkCustomer}

          canCreateCustomer={props.canCreateCustomer}

          labels={props.viewLabels}

          deskLabels={props.deskLabels}

          sessionCommandsLabel={props.deskLabels.sessionCommands}

          emptyTitle={props.sessionEmptyTitle}

          emptyHint={props.sessionEmptyHint}

          onSend={props.onSend}

          onRetrySend={props.onRetrySend}

          retrySendLabel={props.retrySendLabel}

          onAvatarClick={handleAvatarClick}

          agentsById={props.agentsById}

          profilesByUserId={props.profilesByUserId}

          onOpenAiSection={handleOpenAiSection}

          onTakeOver={props.sessionActions.onTakeOver}

          onAssign={props.sessionActions.onAssign}

          onOpenAssignment={props.sessionActions.onOpenAssignment}

          onRelease={props.sessionActions.onRelease}

          onClose={props.sessionActions.onClose}

          onResolve={props.sessionActions.onResolve}

          onReopen={props.sessionActions.onReopen}

          onEscalate={props.sessionActions.onEscalate}

          onReturnConversation={props.sessionActions.onReturnConversation}

          onCancelEscalation={props.sessionActions.onCancelEscalation}

          onCreateCustomer={props.sessionActions.onCreateCustomer}

          onLinkCustomer={props.sessionActions.onLinkCustomer}

          crmPanelLabel={props.intelligenceLabels.tabs.crm}

          deskChrome={deskChrome}

        />



        <InboxResizeHandle

          enabled={inboxResizeEnabled && !conversationExpanded}

          ariaLabel={props.deskLabels.resizeQueue}

          onResizeStart={startInboxResize}

        />



        <InboxColumn

          title={props.inboxTitle}

          conversations={props.conversations}

          selectedId={props.selectedId}

          isLoading={props.listLoading}

          hasMore={props.hasMore}

          emptyTitle={props.inboxEmptyTitle}

          emptyHint={props.inboxEmptyHint}

          loadingLabel={props.loadingLabel}

          onSelect={handleSelectConversation}

          onLoadMore={props.onLoadMore}

          rowLabels={props.rowLabels}

          unreadOverflowLabel={props.unreadOverflowLabel}

        />

      </div>

    </div>

  );

});

