import { memo, useCallback, useRef } from "react";
import { useAgentDeskKeyboard } from "@/components/omnichannel/agent-desk/use-agent-desk-keyboard";
import { CommandDeck } from "@/components/omnichannel/agent-desk/command-deck";
import { QueueRail } from "@/components/omnichannel/agent-desk/queue-rail";
import { QueuePanel } from "@/components/omnichannel/agent-desk/queue-panel";
import { ActiveSession } from "@/components/omnichannel/agent-desk/active-session";
import { InsightPanel } from "@/components/omnichannel/agent-desk/insight-panel";
import { FilterPopover } from "@/components/omnichannel/agent-desk/filter-popover";
import type { ComposePanelHandle } from "@/components/omnichannel/agent-desk/compose-panel";
import type { ComposerSendPayload } from "@/lib/omnichannel/types/composer-enterprise-types";
import type { OutboundSendError } from "@/hooks/conversations/use-team-inbox-reply";
import type { AgentDeskLabels } from "@/components/omnichannel/types/workspace-labels";
import type { UnifiedConversation } from "@/lib/omnichannel/types/unified-conversation";
import type { OmnichannelListFilters } from "@/lib/omnichannel/types/unified-conversation";
import type { OmnichannelQueueFilter } from "@/lib/omnichannel/services/conversation-queues";
import type { WorkspaceSidebarLabels, ConversationViewLabels } from "@/components/omnichannel/types/workspace-labels";
import type {
  OmnichannelAiAssistModel,
  OmnichannelCustomerContext,
  UnifiedMessage,
} from "@/lib/omnichannel/types/unified-conversation";
import type { LifecycleSnapshot, LifecycleAction } from "@/lib/conversation-lifecycle";
import type { OperationalEscalationRecord } from "@/lib/conversation-lifecycle";
import type { ConversationRecord } from "@workspace/ai-conversation";

export type AgentDeskShellProps = {
  composeRef?: React.RefObject<ComposePanelHandle | null>;
  deskLabels: AgentDeskLabels;
  title: string;
  stats: Array<{ key: string; label: string; value: number; tone?: string }>;
  searchRef?: React.RefObject<HTMLInputElement | null>;
  searchValue: string;
  searchPlaceholder: string;
  onSearchChange: (value: string) => void;
  filters: OmnichannelListFilters;
  onFiltersChange: (patch: Partial<OmnichannelListFilters>) => void;
  filterLabels: Record<string, string>;
  filterActiveCount: number;
  tagOptions: Array<{ id: string; label: string; count: number }>;
  currentUserId?: string | null;
  queueOpen: boolean;
  onQueueOpenChange: (open: boolean) => void;
  queueWidth: number;
  onQueueWidthChange: (width: number) => void;
  insightOpen: boolean;
  onInsightOpenChange: (open: boolean) => void;
  conversationMaximized?: boolean;
  onToggleMaximize?: () => void;
  filtersOpen: boolean;
  onFiltersOpenChange: (open: boolean) => void;
  activeQueue: OmnichannelQueueFilter;
  onQueueChange: (queue: OmnichannelQueueFilter) => void;
  queueCounts: Record<OmnichannelQueueFilter, number> & Record<string, number>;
  queueLabels: Record<OmnichannelQueueFilter, string>;
  totalCount: number;
  conversations: UnifiedConversation[];
  selectedId: string | null;
  listLoading: boolean;
  hasMore: boolean;
  onSelectConversation: (id: string) => void;
  onLoadMore: () => void;
  queuePanelLabels: {
    empty: string;
    loading: string;
    unknownContact: string;
    visitorLabel: string;
    noPreview: string;
    aiEmployee: string;
    unassigned: string;
    open: string;
    newBadge?: string;
    emptyHint?: string;
    pin?: string;
    star?: string;
    markUnread?: string;
    follow?: string;
    name: string;
    phone: string;
    channel: string;
    owner: string;
    priority: string;
    time: string;
  };
  conversation: UnifiedConversation | null;
  messages: UnifiedMessage[];
  aiAssist: OmnichannelAiAssistModel;
  lifecycleSnapshot?: LifecycleSnapshot | null;
  messagesLoading: boolean;
  isSending: boolean;
  sendError: OutboundSendError | null;
  actionsPending: boolean;
  escalated?: boolean;
  isClosed?: boolean;
  canPerform?: (record: ConversationRecord, action: LifecycleAction) => boolean;
  canLinkCustomer?: boolean;
  canCreateCustomer?: boolean;
  viewLabels: ConversationViewLabels;
  onSend: (payload: ComposerSendPayload) => void;
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
    onTemplates?: () => void;
  };
  customerContext: OmnichannelCustomerContext | null;
  insightLabels: WorkspaceSidebarLabels;
  escalations: OperationalEscalationRecord[];
  onReturnEscalation: () => void;
  insightLabel: string;
  companyId?: string | null;
  children?: React.ReactNode;
};

export const AgentDeskShell = memo(function AgentDeskShell(props: AgentDeskShellProps) {
  const internalComposeRef = useRef<ComposePanelHandle>(null);
  const composeRef = props.composeRef ?? internalComposeRef;
  const internalSearchRef = useRef<HTMLInputElement>(null);
  const searchRef = props.searchRef ?? internalSearchRef;

  const queueTitle = props.activeQueue === "all" ? props.queueLabels.all : props.queueLabels[props.activeQueue];
  const showQueue = props.queueOpen && !props.conversationMaximized;
  const showInsight = props.insightOpen && !props.conversationMaximized;

  const handleEscape = useCallback(() => {
    if (props.filtersOpen) {
      props.onFiltersOpenChange(false);
    } else if (showInsight) {
      props.onInsightOpenChange(false);
    } else if (showQueue) {
      props.onQueueOpenChange(false);
    }
  }, [
    props.filtersOpen,
    showInsight,
    showQueue,
    props.onFiltersOpenChange,
    props.onInsightOpenChange,
    props.onQueueOpenChange,
  ]);

  useAgentDeskKeyboard({
    enabled: true,
    onSearch: () => searchRef.current?.focus(),
    onEscape: handleEscape,
  });

  return (
    <div className="agent-desk flex h-[calc(100vh-4.25rem)] flex-col overflow-hidden rounded-lg border border-[var(--ad-border)]">
      <CommandDeck
        ref={searchRef}
        title={props.title}
        subtitle={props.deskLabels.subtitle}
        stats={props.stats}
        searchValue={props.searchValue}
        searchPlaceholder={props.searchPlaceholder}
        onSearchChange={props.onSearchChange}
        onOpenFilters={() => props.onFiltersOpenChange(true)}
        onOpenInsight={() => props.onInsightOpenChange(!props.insightOpen)}
        insightOpen={showInsight}
        insightLabel={props.insightLabel}
        filterActiveCount={props.filterActiveCount}
        filtersLabel={props.deskLabels.filters}
        loading={props.listLoading}
        conversationMaximized={props.conversationMaximized}
        onToggleMaximize={props.onToggleMaximize}
        maximizeLabel={props.deskLabels.maximizeConversation}
      />

      <div className="flex min-h-0 flex-1">
        {!props.conversationMaximized ? (
          <QueueRail
            activeQueue={props.activeQueue}
            onQueueChange={(queue) => {
              props.onQueueChange(queue);
              props.onFiltersChange({ queue: queue === "all" ? undefined : queue });
              props.onQueueOpenChange(true);
            }}
            onOpenQueuePanel={() => props.onQueueOpenChange(true)}
            queueOpen={props.queueOpen}
            counts={props.queueCounts}
            labels={props.queueLabels}
            ariaLabels={{
              navigation: props.deskLabels.queueNavigation,
              openList: props.deskLabels.openConversationList,
            }}
          />
        ) : null}

        {showQueue ? (
          <QueuePanel
            open
            width={props.queueWidth}
            onResize={props.onQueueWidthChange}
            onClose={() => props.onQueueOpenChange(false)}
            conversations={props.conversations}
            selectedId={props.selectedId}
            isLoading={props.listLoading}
            hasMore={props.hasMore}
            onSelect={(id) => {
              props.onSelectConversation(id);
            }}
            onLoadMore={props.onLoadMore}
            title={queueTitle}
            labels={props.queuePanelLabels}
            deskLabels={props.deskLabels}
            onClearFilters={() => {
              props.onQueueChange("all");
              props.onFiltersChange({
                unreadOnly: undefined,
                pinnedOnly: undefined,
                archived: undefined,
                assignedOnly: undefined,
                handlerMode: undefined,
                channel: undefined,
                tag: undefined,
                assignedUserId: undefined,
                queue: undefined,
              });
            }}
          />
        ) : null}

        <div className="relative flex min-w-0 flex-1 flex-col">
          <ActiveSession
            composeRef={composeRef}
            conversation={props.conversation}
            messages={props.messages}
            aiAssist={props.aiAssist}
            lifecycleSnapshot={props.lifecycleSnapshot}
            isLoading={props.messagesLoading}
            isSending={props.isSending}
            sendError={props.sendError}
            actionsPending={props.actionsPending}
            escalated={props.escalated}
            isClosed={props.isClosed}
            canPerform={props.canPerform}
            canLinkCustomer={props.canLinkCustomer}
            canCreateCustomer={props.canCreateCustomer}
            labels={props.viewLabels}
            deskLabels={props.deskLabels}
            onSend={props.onSend}
            onOpenQueue={() => props.onQueueOpenChange(true)}
            onOpenFilters={() => props.onFiltersOpenChange(true)}
            onFocusComposer={() => composeRef.current?.focus()}
            onOpenCustomer360={() => props.onInsightOpenChange(true)}
            sessionCommandsLabel={props.deskLabels.sessionCommands}
            {...props.sessionActions}
          />

          <InsightPanel
            open={showInsight}
            onClose={() => props.onInsightOpenChange(false)}
            conversation={props.conversation}
            messages={props.messages}
            context={props.customerContext}
            aiAssist={props.aiAssist}
            lifecycleSnapshot={props.lifecycleSnapshot}
            escalations={props.escalations}
            labels={props.insightLabels}
            deskLabels={props.deskLabels}
            companyId={props.companyId}
            onReturnEscalation={props.onReturnEscalation}
            onOpenAssignment={props.sessionActions.onOpenAssignment}
            onLinkCustomer={props.sessionActions.onLinkCustomer}
            onCreateCustomer={props.sessionActions.onCreateCustomer}
          />
        </div>
      </div>

      <FilterPopover
        open={props.filtersOpen}
        onClose={() => props.onFiltersOpenChange(false)}
        filters={props.filters}
        onChange={props.onFiltersChange}
        currentUserId={props.currentUserId}
        tagOptions={props.tagOptions}
        labels={props.filterLabels}
        closeLabel={props.deskLabels.closeFilters}
        channelSectionLabel={props.deskLabels.channelSection}
        tagSectionLabel={props.deskLabels.tagSection}
      />

      {props.children}
    </div>
  );
});
