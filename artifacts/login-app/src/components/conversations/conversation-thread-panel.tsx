import { useState } from "react";
import { format } from "date-fns";
import type { ConversationMessageRecord, ConversationRecord } from "@workspace/ai-conversation";
import { Loader2, Send, UserCheck, UserMinus, XCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Can } from "@/components/rbac/permission-guard";
import { DashboardCard, DashboardErrorBanner } from "@/components/dashboard/ui";
import { useAuth } from "@/context/auth-context";

type ConversationThreadPanelProps = {
  conversation: ConversationRecord | null;
  messages: ConversationMessageRecord[];
  isLoading: boolean;
  isSending: boolean;
  sendError: string | null;
  onSend: (text: string) => void;
  onAssign: () => void;
  onRelease: () => void;
  onClose: () => void;
  actionsPending: boolean;
};

function messageRole(messageType: string): "customer" | "agent" | "system" {
  if (messageType === "incoming") return "customer";
  if (messageType === "outgoing") return "agent";
  return "system";
}

export function ConversationThreadPanel({
  conversation,
  messages,
  isLoading,
  isSending,
  sendError,
  onSend,
  onAssign,
  onRelease,
  onClose,
  actionsPending,
}: ConversationThreadPanelProps) {
  const { t } = useTranslation("common");
  const { user } = useAuth();
  const [draft, setDraft] = useState("");

  if (!conversation) {
    return (
      <DashboardCard className="h-full flex items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">{t("dashboard.inbox.selectConversation")}</p>
      </DashboardCard>
    );
  }

  const handleSend = () => {
    if (!draft.trim()) return;
    onSend(draft);
    setDraft("");
  };

  const assignedToMe = conversation.assigned_user_id === user?.id;

  return (
    <DashboardCard className="h-full flex flex-col overflow-hidden">
      <div className="p-4 border-b border-white/5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">{conversation.conversation_number}</h2>
          <p className="text-xs text-muted-foreground capitalize mt-0.5">
            {conversation.channel_type.replace(/_/g, " ")} · {conversation.state.replace(/_/g, " ")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Can permission="ai.conversations.takeover">
            <Button
              size="sm"
              variant="outline"
              className="border-white/10 gap-1.5"
              disabled={actionsPending || assignedToMe}
              onClick={onAssign}
            >
              <UserCheck className="w-3.5 h-3.5" />
              {t("dashboard.inbox.takeover")}
            </Button>
          </Can>
          <Can permission="ai.conversations.release">
            <Button
              size="sm"
              variant="outline"
              className="border-white/10 gap-1.5"
              disabled={actionsPending || !assignedToMe}
              onClick={onRelease}
            >
              <UserMinus className="w-3.5 h-3.5" />
              {t("dashboard.inbox.release")}
            </Button>
          </Can>
          <Can permission="ai.conversations.reply">
            <Button
              size="sm"
              variant="outline"
              className="border-white/10 gap-1.5"
              disabled={actionsPending || conversation.state === "closed"}
              onClick={onClose}
            >
              <XCircle className="w-3.5 h-3.5" />
              {t("dashboard.inbox.close")}
            </Button>
          </Can>
        </div>
      </div>

      {sendError && <DashboardErrorBanner message={sendError} />}

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {isLoading && <p className="text-sm text-muted-foreground">{t("status.loading")}</p>}
        {!isLoading &&
          messages.map((message) => {
            const role = messageRole(message.message_type);
            const align = role === "customer" ? "items-start" : role === "agent" ? "items-end" : "items-center";
            const bubble =
              role === "customer"
                ? "bg-white/5 border-white/10"
                : role === "agent"
                  ? "bg-primary/15 border-primary/20"
                  : "bg-amber-500/10 border-amber-500/20 text-xs";

            return (
              <div key={message.id} className={`flex flex-col ${align}`}>
                <div className={`max-w-[85%] rounded-xl border px-3 py-2 text-sm ${bubble}`}>
                  {message.content}
                </div>
                <span className="text-[10px] text-muted-foreground mt-1 px-1">
                  {format(new Date(message.created_at), "PPp")}
                </span>
              </div>
            );
          })}
      </div>

      <Can permission="ai.conversations.reply">
        <div className="p-4 border-t border-white/5 flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleSend())}
            placeholder={t("dashboard.inbox.replyPlaceholder")}
            disabled={isSending || conversation.state === "closed"}
            className="flex-1 bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary/40"
          />
          <Button
            onClick={handleSend}
            disabled={isSending || !draft.trim() || conversation.state === "closed"}
            className="gap-2"
          >
            {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {t("buttons.send")}
          </Button>
        </div>
      </Can>
    </DashboardCard>
  );
}
