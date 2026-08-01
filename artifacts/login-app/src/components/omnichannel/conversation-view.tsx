import { memo, useRef } from "react";
import { DashboardErrorBanner } from "@/components/dashboard/ui";
import { CustomerHeader } from "@/components/omnichannel/customer-header";
import { ConversationActionBar } from "@/components/omnichannel/conversation-action-bar";
import { MessageThread } from "@/components/omnichannel/message-thread";
import { ReplyComposer } from "@/components/omnichannel/reply-composer";
import { OmnichannelPanel } from "@/components/omnichannel/omnichannel-panel";
import type {
  OmnichannelAiAssistModel,
  UnifiedConversation,
  UnifiedMessage,
} from "@/lib/omnichannel/types/unified-conversation";
import type { LifecycleSnapshot, LifecycleAction } from "@/lib/conversation-lifecycle";
import type { ConversationRecord } from "@workspace/ai-conversation";
import { usePermissions } from "@/hooks/use-rbac";
import { CONVERSATION_LIFECYCLE_PERMISSIONS } from "@/lib/conversation-lifecycle";

export type ConversationViewLabels = {
  selectConversation: string;
  loading: string;
  unknownContact: string;
  createCustomer: string;
  linkCustomer: string;
  vip: string;
  owner: string;
  unassigned: string;
  escalated: string;
  status: string;
  sla: string;
  language: string;
  lastActivity: string;
  resolve: string;
  reopen: string;
  reply: string;
  assign: string;
  statusAction: string;
  escalate: string;
  close: string;
  ai: string;
  release: string;
  returnConversation: string;
  cancelEscalation: string;
  more: string;
  internalNote: string;
  send: string;
  templates: string;
  variables: string;
  voicePlaceholder: string;
  emoji: string;
  attachments: string;
  aiRewrite: string;
  translate: string;
  composerPlaceholder: string;
  languageComposer: string;
};

type ConversationViewProps = {
  conversation: UnifiedConversation | null;
  messages: UnifiedMessage[];
  aiAssist: OmnichannelAiAssistModel;
  lifecycleSnapshot?: LifecycleSnapshot | null;
  isLoading: boolean;
  isSending: boolean;
  sendError: string | null;
  assignedToMe: boolean;
  actionsPending: boolean;
  escalated?: boolean;
  ownerLabel?: string | null;
  isClosed?: boolean;
  canPerform?: (record: ConversationRecord, action: LifecycleAction) => boolean;
  canLinkCustomer?: boolean;
  canCreateCustomer?: boolean;
  labels: ConversationViewLabels;
  onSend: (payload: { text: string; mode: "reply" | "internal_note" }) => void;
  onAssign: () => void;
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
};

export const ConversationView = memo(function ConversationView({
  conversation,
  messages,
  aiAssist,
  lifecycleSnapshot,
  isLoading,
  isSending,
  sendError,
  assignedToMe,
  actionsPending,
  escalated,
  ownerLabel,
  isClosed,
  canPerform,
  canLinkCustomer,
  canCreateCustomer,
  labels,
  onSend,
  onAssign,
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
}: ConversationViewProps) {
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const { hasPermission, isSuperAdmin } = usePermissions();
  const canViewInternalNotes =
    isSuperAdmin
    || hasPermission(CONVERSATION_LIFECYCLE_PERMISSIONS.internalNote)
    || hasPermission(CONVERSATION_LIFECYCLE_PERMISSIONS.reply);

  if (!conversation) {
    return (
      <OmnichannelPanel className="flex h-full items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">{labels.selectConversation}</p>
      </OmnichannelPanel>
    );
  }

  const customerMessages = messages.filter((message) => !message.isInternalNote);
  const internalNotes = canViewInternalNotes
    ? messages.filter((message) => message.isInternalNote)
    : [];
  const record = conversation.source;
  const actionAllowed = (action: LifecycleAction) => canPerform?.(record, action) ?? false;
  const header = lifecycleSnapshot?.header;

  return (
    <OmnichannelPanel className="h-full">
      {header ? (
        <CustomerHeader
          header={header}
          handlerMode={conversation.handlerMode}
          escalated={escalated}
          languageLabel={aiAssist.languageLabel}
          lastActivityAt={conversation.lastActivityAt}
          canLinkCustomer={canLinkCustomer}
          canCreateCustomer={canCreateCustomer}
          labels={{
          unknownContact: labels.unknownContact,
          createCustomer: labels.createCustomer,
          linkCustomer: labels.linkCustomer,
          vip: labels.vip,
          owner: labels.owner,
          unassigned: labels.unassigned,
          escalated: labels.escalated,
          status: labels.status,
          sla: labels.sla,
          language: labels.language,
          lastActivity: labels.lastActivity,
        }}
        onCreateCustomer={onCreateCustomer}
        onLinkCustomer={onLinkCustomer}
        />
      ) : null}

      <ConversationActionBar
        assignedToMe={assignedToMe}
        disabled={actionsPending || Boolean(isClosed)}
        escalated={escalated}
        canAssign={actionAllowed("take_over")}
        canRelease={actionAllowed("return_to_ai")}
        canClose={actionAllowed("close")}
        canResolve={actionAllowed("resolve")}
        canReopen={actionAllowed("reopen")}
        canEscalate={actionAllowed("escalate")}
        isClosed={Boolean(isClosed)}
        labels={{
          reply: labels.reply,
          assign: labels.assign,
          status: labels.statusAction,
          ai: labels.ai,
          escalate: labels.escalate,
          close: labels.close,
          resolve: labels.resolve,
          reopen: labels.reopen,
          release: labels.release,
          returnConversation: labels.returnConversation,
          cancelEscalation: labels.cancelEscalation,
          more: labels.more,
        }}
        onFocusComposer={() => composerRef.current?.focus()}
        onAssign={onAssign}
        onRelease={onRelease}
        onClose={onClose}
        onResolve={onResolve}
        onReopen={onReopen}
        onEscalate={onEscalate}
        onReturnConversation={onReturnConversation}
        onCancelEscalation={onCancelEscalation}
        onOpenAi={onOpenAiSection}
      />

      {sendError ? <DashboardErrorBanner message={sendError} /> : null}

      <div className="flex min-h-0 flex-1 flex-col bg-gradient-to-b from-transparent to-black/[0.08]">
        <div
          className="flex-1 overflow-y-auto px-4 py-4 sm:px-5"
          role="log"
          aria-live="polite"
          aria-label="Conversation messages"
        >
          {isLoading ? <p className="text-sm text-muted-foreground">{labels.loading}</p> : null}
          {!isLoading ? (
            <MessageThread
              messages={[...customerMessages, ...internalNotes]}
              showInternalNotes={canViewInternalNotes}
            />
          ) : null}
        </div>

        <ReplyComposer
          ref={composerRef}
          disabled={Boolean(isClosed)}
          isSending={isSending}
          suggestedReplies={aiAssist.suggestedReplies}
          detectedLanguage={aiAssist.languageLabel}
          placeholder={labels.composerPlaceholder}
          internalNoteLabel={labels.internalNote}
          replyLabel={labels.reply}
          sendLabel={labels.send}
          templatesLabel={labels.templates}
          variablesLabel={labels.variables}
          voicePlaceholderLabel={labels.voicePlaceholder}
          emojiLabel={labels.emoji}
          attachmentsLabel={labels.attachments}
          aiRewriteLabel={labels.aiRewrite}
          translateLabel={labels.translate}
          languageLabel={labels.languageComposer}
          onSend={onSend}
        />
      </div>
    </OmnichannelPanel>
  );
});
