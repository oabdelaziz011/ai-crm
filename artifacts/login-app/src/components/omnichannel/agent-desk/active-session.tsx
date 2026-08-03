import { memo, useCallback, useMemo, useRef } from "react";
import { DashboardErrorBanner } from "@/components/dashboard/ui";
import { DeskEmptyState } from "@/components/omnichannel/agent-desk/desk-empty-state";
import { SessionIdentityStrip } from "@/components/omnichannel/agent-desk/session-identity-strip";
import { SessionCommandStrip } from "@/components/omnichannel/agent-desk/session-command-strip";
import { TranscriptView, type TranscriptViewHandle } from "@/components/omnichannel/agent-desk/transcript-view";
import { ComposePanel, type ComposePanelHandle } from "@/components/omnichannel/agent-desk/compose-panel";
import { getComposerPlaceholder, getKeyboardHint, getTranslationToggleLabels } from "@/lib/omnichannel/services/omnichannel-productivity-library";
import { getAiAssistantButtonLabel, getSuggestedReplyExplainLabels } from "@/lib/omnichannel/presentation/ai-assistant-labels";
import { resolveAgentWorkspaceLanguage } from "@/lib/omnichannel/services/conversation-language-detector";
import { useConversationExperience } from "@/hooks/omnichannel/use-conversation-experience";
import { useTranslation } from "react-i18next";
import type {
  OmnichannelAiAssistModel,
  UnifiedConversation,
  UnifiedMessage,
} from "@/lib/omnichannel/types/unified-conversation";
import type { ComposerSendPayload } from "@/lib/omnichannel/types/composer-enterprise-types";
import type { OutboundSendError } from "@/hooks/conversations/use-team-inbox-reply";
import type { LifecycleSnapshot, LifecycleAction } from "@/lib/conversation-lifecycle";
import type { ConversationRecord } from "@workspace/ai-conversation";
import type { AgentDeskLabels, ConversationViewLabels } from "@/components/omnichannel/types/workspace-labels";
import { usePermissions } from "@/hooks/use-rbac";
import { CONVERSATION_LIFECYCLE_PERMISSIONS } from "@/lib/conversation-lifecycle";

type ActiveSessionProps = {
  conversation: UnifiedConversation | null;
  messages: UnifiedMessage[];
  aiAssist: OmnichannelAiAssistModel;
  lifecycleSnapshot?: LifecycleSnapshot | null;
  isLoading: boolean;
  isSending: boolean;
  sendError: OutboundSendError | null;
  actionsPending: boolean;
  escalated?: boolean;
  isClosed?: boolean;
  canPerform?: (record: ConversationRecord, action: LifecycleAction) => boolean;
  canLinkCustomer?: boolean;
  canCreateCustomer?: boolean;
  labels: ConversationViewLabels;
  deskLabels: AgentDeskLabels;
  sessionCommandsLabel: string;
  onSend: (payload: ComposerSendPayload) => void | Promise<boolean>;
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
  onOpenQueue?: () => void;
  onOpenFilters?: () => void;
  onFocusComposer?: () => void;
  onOpenCustomer360?: () => void;
  onTranslate?: () => void;
  onTemplates?: () => void;
  composeRef?: React.RefObject<ComposePanelHandle | null>;
};

export const ActiveSession = memo(function ActiveSession({
  conversation,
  messages,
  aiAssist,
  lifecycleSnapshot,
  isLoading,
  isSending,
  sendError,
  actionsPending,
  escalated,
  isClosed,
  canPerform,
  canLinkCustomer,
  canCreateCustomer,
  labels,
  deskLabels,
  sessionCommandsLabel,
  onSend,
  onTakeOver,
  onAssign,
  onOpenAssignment,
  onRelease,
  onClose,
  onResolve,
  onReopen,
  onEscalate,
  onReturnConversation,
  onCancelEscalation,
  onOpenAiSection,
  onCreateCustomer,
  onLinkCustomer,
  onOpenQueue,
  onOpenFilters,
  onFocusComposer,
  onOpenCustomer360,
  onTranslate,
  onTemplates,
  composeRef: externalComposeRef,
}: ActiveSessionProps) {
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

  const matchIds = useMemo(
    () => messages.filter((m) => !m.isInternalNote && m.body.toLowerCase().includes(experience.searchQuery.trim().toLowerCase())).map((m) => m.id),
    [messages, experience.searchQuery],
  );

  const handleSend = useCallback(
    async (payload: ComposerSendPayload) => {
      experience.notifyAgentTyping(false);
      const ok = await onSend(payload);
      if (ok !== false) {
        transcriptRef.current?.onMessageSent();
      }
      return ok !== false;
    },
    [onSend, experience],
  );
  const { hasPermission, isSuperAdmin } = usePermissions();
  const canViewNotes =
    isSuperAdmin
    || hasPermission(CONVERSATION_LIFECYCLE_PERMISSIONS.internalNote)
    || hasPermission(CONVERSATION_LIFECYCLE_PERMISSIONS.reply);

  if (!conversation) {
    return (
      <DeskEmptyState
        variant="session"
        title={labels.selectConversation}
        description={labels.sessionEmptyDescription}
        actionLabel={labels.openInbox}
        onAction={onOpenQueue}
        secondaryActionLabel={labels.browseFilters}
        onSecondaryAction={onOpenFilters}
      />
    );
  }

  const record = conversation.source;
  const allowed = (action: LifecycleAction) => canPerform?.(record, action) ?? false;
  const header = lifecycleSnapshot?.header;
  const lifecycleState = lifecycleSnapshot?.state ?? conversation.lifecycleState;
  const customerMessages = messages.filter((m) => !m.isInternalNote);
  const internalNotes = canViewNotes ? messages.filter((m) => m.isInternalNote) : [];

  return (
    <div className="agent-desk__mesh flex min-h-0 flex-1 flex-col">
      {header ? (
        <SessionIdentityStrip
          header={header}
          conversationId={conversation.id}
          languageLabel={aiAssist.languageLabel}
          escalated={escalated}
          canLinkCustomer={canLinkCustomer}
          canCreateCustomer={canCreateCustomer}
          channelLabel={deskLabels.channel(header.channel)}
          lifecycleLabel={deskLabels.lifecycle(header.lifecycleState)}
          visitorLabel={labels.visitorLabel}
          priorityLabel={deskLabels.priority}
          labels={{
            createCustomer: labels.createCustomer,
            linkCustomer: labels.linkCustomer,
            unassigned: labels.unassigned,
            assignedTo: labels.assignedTo,
            queue: labels.queue,
            priority: labels.priority,
            sla: labels.sla,
            status: labels.status,
            language: labels.language,
            escalated: labels.escalated,
          }}
          onCreateCustomer={onCreateCustomer}
          onLinkCustomer={onLinkCustomer}
          onOpenCustomer360={onOpenCustomer360}
          openCustomer360Label={deskLabels.customer360}
        />
      ) : null}

      <SessionCommandStrip
        lifecycleState={lifecycleState}
        disabled={actionsPending}
        escalated={escalated}
        isClosed={Boolean(isClosed)}
        canPerform={allowed}
        toolbarLabel={sessionCommandsLabel}
        labels={labels as unknown as Record<string, string>}
        onReply={() => composeRef.current?.focus()}
        onInternalNote={() => composeRef.current?.setMode("internal_note")}
        onOpenAi={onOpenAiSection}
        onTakeOver={onTakeOver}
        onAssign={onAssign}
        onOpenAssignment={onOpenAssignment}
        onRelease={onRelease}
        onClose={onClose}
        onResolve={onResolve}
        onReopen={onReopen}
        onEscalate={onEscalate}
        onReturnConversation={onReturnConversation}
        onCancelEscalation={onCancelEscalation}
        onTranslate={onTranslate}
        onTemplates={onTemplates}
      />

      {sendError ? (
        <DashboardErrorBanner message={sendError.detail ? `${sendError.message} ${sendError.detail}` : sendError.message} />
      ) : null}

      <div className="relative min-h-0 flex-1">
        {isLoading ? (
          <p className="p-4 font-mono text-xs text-[var(--ad-text-muted)]">{labels.loading}</p>
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
            onFocusComposer={onFocusComposer}
            focusComposerLabel={deskLabels.emptySecondary.transcript}
          />
        )}
      </div>

      <ComposePanel
        ref={composeRef}
        disabled={Boolean(isClosed)}
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
