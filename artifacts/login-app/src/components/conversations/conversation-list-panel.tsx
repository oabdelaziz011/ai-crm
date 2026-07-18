import { formatDistanceToNow } from "date-fns";
import type { ConversationRecord } from "@workspace/ai-conversation";
import { MessageSquare } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DashboardCard } from "@/components/dashboard/ui";

type ConversationListPanelProps = {
  conversations: ConversationRecord[];
  selectedId: string | null;
  isLoading: boolean;
  onSelect: (conversationId: string) => void;
};

function channelLabel(channelType: string) {
  return channelType.replace(/_/g, " ");
}

export function ConversationListPanel({
  conversations,
  selectedId,
  isLoading,
  onSelect,
}: ConversationListPanelProps) {
  const { t } = useTranslation("common");

  return (
    <DashboardCard className="h-full flex flex-col overflow-hidden">
      <div className="p-4 border-b border-white/5">
        <h2 className="font-semibold text-sm">{t("dashboard.inbox.conversations")}</h2>
        <p className="text-xs text-muted-foreground mt-1">{t("dashboard.inbox.conversationsHint")}</p>
      </div>
      <div className="flex-1 overflow-y-auto divide-y divide-white/5">
        {isLoading && (
          <p className="p-4 text-sm text-muted-foreground">{t("status.loading")}</p>
        )}
        {!isLoading && conversations.length === 0 && (
          <p className="p-6 text-sm text-muted-foreground text-center">{t("dashboard.inbox.empty")}</p>
        )}
        {conversations.map((conversation) => {
          const active = conversation.id === selectedId;
          const unread = conversation.unread_count_employee > 0;
          return (
            <button
              key={conversation.id}
              type="button"
              onClick={() => onSelect(conversation.id)}
              className={`w-full text-start p-4 transition-colors hover:bg-white/[0.03] ${
                active ? "bg-primary/10 border-s-2 border-primary" : ""
              }`}
            >
              <div className="flex items-start gap-3">
                <MessageSquare className={`w-4 h-4 mt-0.5 shrink-0 ${unread ? "text-primary" : "text-muted-foreground"}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-mono text-muted-foreground truncate">
                      {conversation.conversation_number}
                    </span>
                    {conversation.last_message_at && (
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {formatDistanceToNow(new Date(conversation.last_message_at), { addSuffix: true })}
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-medium mt-0.5 capitalize">{channelLabel(conversation.channel_type)}</p>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    {conversation.last_message_preview || t("dashboard.inbox.noPreview")}
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10">
                      {conversation.state.replace(/_/g, " ")}
                    </span>
                    {unread && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/20">
                        {t("dashboard.inbox.unread", { count: conversation.unread_count_employee })}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </DashboardCard>
  );
}
