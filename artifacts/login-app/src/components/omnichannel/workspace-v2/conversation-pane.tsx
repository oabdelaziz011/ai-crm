import { memo, useCallback, useMemo, useRef } from "react";
import { Link } from "wouter";
import { DashboardErrorBanner } from "@/components/dashboard/ui";
import { ConversationHeaderBar } from "@/components/omnichannel/workspace-v2/conversation-header-bar";
import { WorkspaceActionToolbar } from "@/components/omnichannel/workspace-v2/workspace-action-toolbar";
import { HandoffOwnershipBadge } from "@/components/omnichannel/handoff-ownership-badge";
import type { HandoffOwnershipView } from "@/hooks/omnichannel/use-conversation-handoff-ownership";
import { TranscriptView, type TranscriptViewHandle } from "@/components/omnichannel/agent-desk/transcript-view";
import { ComposePanel, type ComposePanelHandle } from "@/components/omnichannel/agent-desk/compose-panel";
import { getComposerPlaceholder, getKeyboardHint, getToneLabel, getTranslationToggleLabels } from "@/lib/omnichannel/services/omnichannel-productivity-library";
import { getAiAssistantButtonLabel, getSuggestedReplyExplainLabels } from "@/lib/omnichannel/presentation/ai-assistant-labels";
import { resolveAgentWorkspaceLanguage } from "@/lib/omnichannel/services/conversation-language-detector";
import { useConversationExperience } from "@/hooks/omnichannel/use-conversation-experience";
import { useOutboundChannelRoute } from "@/hooks/omnichannel/use-outbound-channel-route";
import type { ComposerSendPayload } from "@/lib/omnichannel/types/composer-enterprise-types";
import { traceOmniSendEnter, traceOmniSendExit } from "@/lib/omnichannel/debug/omni-send-pipeline-audit";
import type { OutboundSendError } from "@/hooks/conversations/use-team-inbox-reply";
import {
  channelDiagnosticsHref,
  channelSettingsHref,
} from "@/lib/omnichannel/services/outbound-delivery";
import type { LifecycleSnapshot, LifecycleAction } from "@/lib/conversation-lifecycle";
import type { ConversationRecord } from "@workspace/ai-conversation";
import type { Profile } from "@/lib/types";
import type { OmnichannelAgentRef } from "@/lib/omnichannel/types/unified-conversation";
import type {
  OmnichannelAiAssistModel,
  UnifiedConversation,
  UnifiedMessage,
} from "@/lib/omnichannel/types/unified-conversation";
import { useTranslation } from "react-i18next";
import type { AgentDeskLabels, ConversationViewLabels } from "@/components/omnichannel/types/workspace-labels";

type ConversationPaneProps = {
  conversation: UnifiedConversation | null;
  messages: UnifiedMessage[];
  aiAssist: OmnichannelAiAssistModel;
  lifecycleSnapshot?: LifecycleSnapshot | null;
  isLoading: boolean;
  isSending: boolean;
  sendError: OutboundSendError | null;
  onDismissSendError?: () => void;
  actionsPending: boolean;
  escalated?: boolean;
  isClosed?: boolean;
  canPerform?: (record: ConversationRecord, action: LifecycleAction) => boolean;
  canLinkCustomer?: boolean;
  canCreateCustomer?: boolean;
  labels: ConversationViewLabels;
  deskLabels: AgentDeskLabels;
  sessionCommandsLabel: string;
  emptyTitle: string;
  emptyHint: string;
  onSend: (payload: ComposerSendPayload) => void | Promise<boolean>;
  onRetrySend?: () => void;
  retrySendLabel?: string;
  onTakeOver: () => void;
  onAssign: () => void;
  onOpenAssignment: () => void;
  onRelease: () => void;
  onPauseAi?: () => void;
  onResumeAi?: () => void;
  aiPaused?: boolean;
  handoffOwnership?: HandoffOwnershipView | null;
  onClose: () => void;
  onResolve?: () => void;
  onReopen?: () => void;
  onEscalate: () => void;
  onReturnConversation: () => void;
  onCancelEscalation: () => void;
  onOpenAiSection: () => void;
  onCreateCustomer?: () => void;
  onLinkCustomer?: () => void;
  onAvatarClick?: () => void;
  crmPanelLabel?: string;
  agentsById?: ReadonlyMap<string, OmnichannelAgentRef>;
  profilesByUserId?: ReadonlyMap<string, Profile>;
  composeRef?: React.RefObject<ComposePanelHandle | null>;
  deskChrome?: {
    soundEnabled: boolean;
    soundOnLabel: string;
    soundOffLabel: string;
    onToggleSound: () => void;
    conversationExpanded: boolean;
    expandLabel: string;
    collapseLabel: string;
    onToggleExpand: () => void;
  };
};

export const ConversationPane = memo(function ConversationPane({
  conversation,
  messages,
  aiAssist,
  lifecycleSnapshot,
  isLoading,
  isSending,
  sendError,
  onDismissSendError,
  actionsPending,
  escalated,
  isClosed,
  canPerform,
  canLinkCustomer,
  canCreateCustomer,
  labels,
  deskLabels,
  sessionCommandsLabel,
  emptyTitle,
  emptyHint,
  onSend,
  onRetrySend,
  retrySendLabel,
  onTakeOver,
  onAssign,
  onOpenAssignment,
  onRelease,
  onPauseAi,
  onResumeAi,
  aiPaused,
  handoffOwnership,
  onClose,
  onResolve,
  onReopen,
  onEscalate,
  onReturnConversation,
  onCancelEscalation,
  onOpenAiSection,
  onCreateCustomer,
  onLinkCustomer,
  onAvatarClick,
  crmPanelLabel,
  agentsById,
  profilesByUserId,
  composeRef: externalComposeRef,
  deskChrome,
}: ConversationPaneProps) {
  const { i18n } = useTranslation();
  const internalRef = useRef<ComposePanelHandle>(null);
  const transcriptRef = useRef<TranscriptViewHandle>(null);
  const composeRef = externalComposeRef ?? internalRef;
  const agentLanguage = resolveAgentWorkspaceLanguage(i18n.language);
  const conversationLanguage = aiAssist.resolvedLanguage;
  const productivityLanguage = conversationLanguage;

  const recentCustomerMessageAt = useMemo(() => {
    const lastCustomer = [...messages].reverse().find((message) => message.senderType === "customer");
    return lastCustomer?.timestamp ?? null;
  }, [messages]);

  const experience = useConversationExperience(conversation?.id ?? null, {
    lastActivityAt: conversation?.lastActivityAt ?? null,
    handlerMode: conversation?.handlerMode,
    recentCustomerMessageAt,
  });

  const outboundRoute = useOutboundChannelRoute(
    conversation
      ? {
          conversationId: conversation.id,
          companyChannelId: conversation.companyChannelId,
          channelKey: conversation.channel,
          externalThreadId: conversation.externalThreadId,
        }
      : null,
  );

  const matchIds = useMemo(
    () => messages.filter((m) => !m.isInternalNote && m.body.toLowerCase().includes(experience.searchQuery.trim().toLowerCase())).map((m) => m.id),
    [messages, experience.searchQuery],
  );

  const handleSend = useCallback(
    async (payload: ComposerSendPayload) => {
      experience.notifyAgentTyping(false);
      traceOmniSendEnter({
        layer: 1,
        stage: "AgentWorkspace.onSend",
        file: "conversation-pane.tsx",
        function: "handleSend",
        line: 151,
        conversationId: conversation?.id ?? null,
        extra: { mode: payload.mode },
      });
      const ok = await onSend(payload);
      traceOmniSendExit({
        layer: 1,
        stage: "AgentWorkspace.onSend",
        success: ok !== false,
        conversationId: conversation?.id ?? null,
        extra: { ok },
      });
      if (ok !== false) {
        transcriptRef.current?.onMessageSent();
      }
      return ok !== false;
    },
    [conversation?.id, onSend, experience],
  );

  if (!conversation) {
    return (
      <div className="ws-conversation-pane flex h-full min-h-0 min-w-0 flex-1 flex-col items-center justify-center overflow-hidden bg-[var(--ws-bg)] px-6 text-center">
        <p className="text-sm font-medium">{emptyTitle}</p>
        <p className="mt-1 max-w-sm text-xs text-[var(--ws-muted)]">{emptyHint}</p>
      </div>
    );
  }

  const record = conversation.source;
  const allowed = (action: LifecycleAction) => canPerform?.(record, action) ?? false;
  const header = lifecycleSnapshot?.header;
  const lifecycleState = lifecycleSnapshot?.state ?? conversation.lifecycleState;
  const canReply = allowed("reply");
  const showLinkCustomer = Boolean(canLinkCustomer) && !conversation.customer?.id;
  const customerMessages = messages.filter((message) => !message.isInternalNote);

  return (
    <div className="ws-conversation-pane flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[var(--ws-bg)]">
      {header ? (
        <ConversationHeaderBar
          header={header}
          conversation={conversation}
          conversationId={conversation.id}
          languageLabel={aiAssist.languageLabel}
          customerTone={aiAssist.customerTone}
          customerToneLabel={getToneLabel(aiAssist.customerTone, productivityLanguage)}
          presence={experience.presence}
          presenceLabels={labels.presence}
          channelConnected={outboundRoute.data?.connected ?? null}
          channelConnectionLabels={labels.channelConnection}
          channelIssueMessage={outboundRoute.data?.connected === false ? outboundRoute.data.issue?.message : undefined}
          escalated={escalated}
          canLinkCustomer={canLinkCustomer}
          canCreateCustomer={canCreateCustomer}
          lifecycleLabel={deskLabels.lifecycle(header.lifecycleState)}
          visitorLabel={labels.visitorLabel}
          priorityLabel={deskLabels.priority}
          agentsById={agentsById}
          profilesByUserId={profilesByUserId}
          supportAgentFallback={labels.supportAgent}
          labels={{
            createCustomer: labels.createCustomer,
            linkCustomer: labels.linkCustomer,
            assignedTo: labels.assignedTo,
            assignedAgent: labels.assignedAgent,
            owner: labels.owner,
            aiEmployee: labels.aiEmployee,
            queue: labels.queue,
            priority: labels.priority,
            sla: labels.sla,
            slaBreached: labels.slaBreached,
            noSla: labels.noSla,
            slaRemainingMinutes: labels.slaRemainingMinutes,
            slaRemainingHours: labels.slaRemainingHours,
            status: labels.status,
            language: labels.language,
            escalated: labels.escalated,
            openProfile: labels.openProfile,
            openCustomer360: crmPanelLabel ?? deskLabels.customer360,
          }}
          onCreateCustomer={onCreateCustomer}
          onLinkCustomer={onLinkCustomer}
          onAvatarClick={onAvatarClick}
          customer360Label={crmPanelLabel ?? deskLabels.customer360}
          conversationFlags={experience.conversationFlags}
          bookmarkLabels={labels.conversationBookmarks}
          onToggleBookmark={experience.toggleConversationBookmark}
          deskChrome={deskChrome}
        />
      ) : null}

      {handoffOwnership ? (
        <div className="border-b border-[var(--ws-border-subtle)] px-3 py-1.5">
          <HandoffOwnershipBadge view={handoffOwnership} />
        </div>
      ) : null}

      <WorkspaceActionToolbar
        lifecycleState={lifecycleState}
        disabled={actionsPending}
        escalated={escalated}
        isClosed={Boolean(isClosed)}
        showLinkCustomer={showLinkCustomer}
        canPerform={allowed}
        toolbarLabel={sessionCommandsLabel}
        labels={{ ...(labels as unknown as Record<string, string>), aiAssist: getAiAssistantButtonLabel(conversationLanguage) }}
        onReply={() => composeRef.current?.focus()}
        onInternalNote={() => composeRef.current?.setMode("internal_note")}
        onOpenAi={onOpenAiSection}
        onTakeOver={onTakeOver}
        onAssign={onAssign}
        onOpenAssignment={onOpenAssignment}
        onRelease={onRelease}
        onPauseAi={onPauseAi}
        onResumeAi={onResumeAi}
        aiPaused={aiPaused}
        onClose={onClose}
        onResolve={onResolve}
        onReopen={onReopen}
        onEscalate={onEscalate}
        onReturnConversation={onReturnConversation}
        onCancelEscalation={onCancelEscalation}
        onLinkCustomer={onLinkCustomer}
      />
      {sendError ? (
        <div
          className="border-b border-[var(--ws-danger)]/30 bg-[var(--ws-danger)]/10 px-3 py-2"
          role="alert"
          aria-live="assertive"
        >
          <DashboardErrorBanner message={sendError.detail ? `${sendError.message} ${sendError.detail}` : sendError.message} />
          <div className="mt-2 flex flex-wrap gap-2">
            {onRetrySend && retrySendLabel ? (
              <button type="button" className="ws-btn ws-btn--primary text-[10px]" onClick={onRetrySend}>
                {retrySendLabel}
              </button>
            ) : null}
            <Link href={channelSettingsHref(conversation?.companyChannelId)} className="ws-btn ws-btn--ghost text-[10px]">
              {labels.channelConnection.reconnect}
            </Link>
            <Link href={channelDiagnosticsHref(conversation?.companyChannelId)} className="ws-btn ws-btn--ghost text-[10px]">
              {labels.channelConnection.diagnostics}
            </Link>
            {onDismissSendError ? (
              <button type="button" className="ws-btn ws-btn--ghost text-[10px]" onClick={onDismissSendError}>
                {deskLabels.close}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-hidden">
        {isLoading ? (
          <p className="p-3 text-xs text-[var(--ws-muted)]">{labels.loading}</p>
        ) : (
          <TranscriptView
            ref={transcriptRef}
            conversationId={conversation.id}
            newMessagesLabel={labels.newMessages}
            messages={customerMessages}
            channel={conversation.channel}
            emptyLabel={labels.emptyTranscript}
            emptyHint={labels.emptyTranscriptHint}
            todayLabel={labels.today}
            voiceLabel={labels.voiceLabel}
            aiLabel={labels.ai}
            conversationLanguage={conversationLanguage}
            agentLanguage={agentLanguage}
            translationLabels={getTranslationToggleLabels(agentLanguage)}
            deliveryLabels={labels.deliveryStatus}
            smartTimeLabels={labels.smartTime}
            searchQuery={experience.searchQuery}
            onSearchQueryChange={experience.setSearchQuery}
            searchLabels={labels.transcriptSearch}
            activeMatchIndex={experience.activeMatchIndex}
            onNextMatch={() => experience.setActiveMatchIndex((current) => (matchIds.length ? (current + 1) % matchIds.length : 0))}
            onPreviousMatch={() => experience.setActiveMatchIndex((current) => (matchIds.length ? (current - 1 + matchIds.length) % matchIds.length : 0))}
            bookmarksOnly={experience.bookmarksOnly}
            onToggleBookmarks={() => experience.setBookmarksOnly((value) => !value)}
            starredIds={experience.starredIds}
            onToggleStar={experience.toggleStar}
            getReaction={experience.getReaction}
            onReaction={experience.toggleReaction}
            typingActor={experience.typingActor}
            typingLabels={labels.typingIndicator}
            starLabel={labels.starMessage}
            attachmentPreviewLabel={labels.attachmentPreview}
            attachmentLabels={labels.messageAttachments}
            onFocusComposer={() => composeRef.current?.focus()}
            focusComposerLabel={deskLabels.emptySecondary.transcript}
          />
        )}
      </div>

      <ComposePanel
        ref={composeRef}
        disabled={Boolean(isClosed) || !canReply}
        isSending={isSending}
        conversationId={conversation.id}
        suggestedReplies={aiAssist.suggestedReplies}
        suggestedReplyExplainLabels={getSuggestedReplyExplainLabels(conversationLanguage)}
        conversationLanguage={conversationLanguage}
        detectedLanguage={aiAssist.languageLabel}
        labels={{
          placeholder: getComposerPlaceholder(productivityLanguage),
          internalNote: labels.internalNote,
          reply: labels.reply,
          send: labels.send,
          templates: labels.templates,
          savedReplies: labels.savedReplies,
          variables: labels.variables,
          voice: labels.voicePlaceholder,
          emoji: labels.emoji,
          attachments: labels.attachments,
          aiRewrite: labels.aiRewrite,
          aiAssistant: getAiAssistantButtonLabel(conversationLanguage),
          translate: labels.translate,
          language: labels.languageComposer,
          suggestedReplies: labels.suggestedReplies,
          keyboardHint: getKeyboardHint(productivityLanguage),
          slashCommands: labels.slashCommands,
          snippetCommands: labels.snippetCommands,
          undoSend: labels.undoSend,
          undoAction: labels.undoAction,
          mention: labels.mention,
          translatePanel: labels.composerTranslatePanel,
          mentionPanel: labels.composerMentionPanel,
          disabledReasons: labels.composerDisabledReasons,
        }}
        onDraftChange={(text) => experience.notifyAgentTyping(text.trim().length > 0)}
        undoSecondsLeft={experience.undoSecondsLeft}
        onUndoSend={experience.cancelPendingSend}
        scheduleSendWithUndo={experience.scheduleSendWithUndo}
        onSend={handleSend}
        onOpenAiAssistant={onOpenAiSection}
      />
    </div>
  );
});
