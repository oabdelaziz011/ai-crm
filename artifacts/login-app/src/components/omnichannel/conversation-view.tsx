import { memo } from "react";
import { DashboardCard, DashboardErrorBanner } from "@/components/dashboard/ui";
import { ConversationAssignment } from "@/components/omnichannel/conversation-assignment";
import { MessageBubble } from "@/components/omnichannel/message-bubble";
import { AiAssistPanel, ReplyComposer } from "@/components/omnichannel/reply-composer";
import { ChannelBadge, HandlerModeBadge } from "@/components/omnichannel/channel-badge";
import type {
  OmnichannelAiAssistModel,
  UnifiedConversation,
  UnifiedMessage,
} from "@/lib/omnichannel/types/unified-conversation";

type ConversationViewProps = {
  conversation: UnifiedConversation | null;
  messages: UnifiedMessage[];
  aiAssist: OmnichannelAiAssistModel;
  isLoading: boolean;
  isSending: boolean;
  sendError: string | null;
  assignedToMe: boolean;
  actionsPending: boolean;
  labels: {
    selectConversation: string;
    loading: string;
    typingPlaceholder: string;
    reply: string;
    internalNote: string;
    send: string;
    templates: string;
    variables: string;
    voicePlaceholder: string;
    aiAssistTitle: string;
    summary: string;
    sentiment: string;
    knowledge: string;
    escalation: string;
    translation: string;
    takeover: string;
    release: string;
    close: string;
    ai: string;
    human: string;
    composerPlaceholder: string;
  };
  onSend: (payload: { text: string; mode: "reply" | "internal_note" }) => void;
  onAssign: () => void;
  onRelease: () => void;
  onClose: () => void;
};

export const ConversationView = memo(function ConversationView({
  conversation,
  messages,
  aiAssist,
  isLoading,
  isSending,
  sendError,
  assignedToMe,
  actionsPending,
  labels,
  onSend,
  onAssign,
  onRelease,
  onClose,
}: ConversationViewProps) {
  if (!conversation) {
    return (
      <DashboardCard className="flex h-full items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">{labels.selectConversation}</p>
      </DashboardCard>
    );
  }

  return (
    <DashboardCard className="flex h-full flex-col overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 p-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">{conversation.customer?.name ?? labels.selectConversation}</h2>
            <ChannelBadge channel={conversation.channel} />
            <HandlerModeBadge mode={conversation.handlerMode} aiLabel={labels.ai} humanLabel={labels.human} />
          </div>
          <p className="mt-1 text-xs capitalize text-muted-foreground">
            {conversation.status.replace(/_/g, " ")} · {conversation.priority}
          </p>
          <p className="mt-1 text-[10px] text-muted-foreground">{labels.typingPlaceholder}</p>
        </div>
        <ConversationAssignment
          assignedToMe={assignedToMe}
          disabled={actionsPending}
          takeoverLabel={labels.takeover}
          releaseLabel={labels.release}
          closeLabel={labels.close}
          onAssign={onAssign}
          onRelease={onRelease}
          onClose={onClose}
        />
      </div>

      {sendError ? <DashboardErrorBanner message={sendError} /> : null}

      <div className="grid flex-1 min-h-0 xl:grid-cols-[1fr_280px]">
        <div className="flex min-h-0 flex-col">
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {isLoading ? <p className="text-sm text-muted-foreground">{labels.loading}</p> : null}
            {!isLoading &&
              messages.map((message) => <MessageBubble key={message.id} message={message} />)}
          </div>
          <ReplyComposer
            disabled={conversation.status === "closed"}
            isSending={isSending}
            suggestedReplies={aiAssist.suggestedReplies}
            placeholder={labels.composerPlaceholder}
            internalNoteLabel={labels.internalNote}
            replyLabel={labels.reply}
            sendLabel={labels.send}
            templatesLabel={labels.templates}
            variablesLabel={labels.variables}
            voicePlaceholderLabel={labels.voicePlaceholder}
            onSend={onSend}
          />
        </div>
        <div className="hidden border-s border-white/5 p-4 xl:block">
          <AiAssistPanel
            model={aiAssist}
            title={labels.aiAssistTitle}
            summaryLabel={labels.summary}
            sentimentLabel={labels.sentiment}
            knowledgeLabel={labels.knowledge}
            escalationLabel={labels.escalation}
            translationLabel={labels.translation}
          />
        </div>
      </div>
    </DashboardCard>
  );
});
