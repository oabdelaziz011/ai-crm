import { formatDistanceToNow } from "date-fns";
import type { ConversationRecord } from "@workspace/ai-conversation";
import { MessageSquare } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DashboardCard } from "@/components/dashboard/ui";
import { InboxChannelBadge } from "@/components/conversations/inbox-channel-badge";
import { buildConversationListDisplay } from "@/lib/conversations/conversation-list-display";
import type { Customer } from "@/lib/types";

type ConversationListPanelProps = {
  conversations: ConversationRecord[];
  customersById?: ReadonlyMap<string, Pick<Customer, "name" | "phone">>;
  selectedId: string | null;
  isLoading: boolean;
  onSelect: (conversationId: string) => void;
};

export function ConversationListPanel({
  conversations,
  customersById,
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
          const customer = conversation.customer_id
            ? customersById?.get(conversation.customer_id)
            : undefined;
          const display = buildConversationListDisplay(conversation, customer);
          const title = display.customerName ?? t("dashboard.inbox.unknownContact");
          const phone = display.customerPhone ?? t("forms.customer.notSet");

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
                <MessageSquare
                  className={`w-4 h-4 mt-1 shrink-0 ${unread ? "text-primary" : "text-muted-foreground"}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold truncate min-w-0">{title}</p>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <InboxChannelBadge channelType={conversation.channel_type} />
                      {conversation.last_message_at && (
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                          {formatDistanceToNow(new Date(conversation.last_message_at), { addSuffix: true })}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{phone}</p>
                  <p className="text-xs text-muted-foreground/90 mt-1 line-clamp-2">
                    {display.preview ?? t("dashboard.inbox.noPreview")}
                  </p>
                  {unread && (
                    <div className="mt-2">
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/20">
                        {t("dashboard.inbox.unread", { count: conversation.unread_count_employee })}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </DashboardCard>
  );
}
