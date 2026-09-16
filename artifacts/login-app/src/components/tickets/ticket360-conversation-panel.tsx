import { Loader2, MessageSquare, Paperclip } from "lucide-react";
import { useTranslation } from "react-i18next";
import { EnterpriseEmptyState } from "@/components/enterprise";
import { TicketDateTime } from "@/components/tickets/ticket-badges";
import { useTicketConversationTranscript } from "@/hooks/tickets/use-ticket-conversation";
import { cn } from "@/lib/utils";

export function Ticket360ConversationPanel({
  conversationId,
  channelType,
}: {
  conversationId: string | null;
  channelType: string | null;
}) {
  const { t, i18n } = useTranslation("common");
  const transcript = useTicketConversationTranscript(conversationId);

  if (!conversationId) {
    return (
      <div className="p-5 sm:p-6">
        <EnterpriseEmptyState
          icon={<MessageSquare className="size-6" aria-hidden />}
          title={t("tickets.360.noConversationTitle")}
          description={t("tickets.360.noConversationBody")}
        />
      </div>
    );
  }

  if (transcript.isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        {t("tickets.360.conversationLoading")}
      </div>
    );
  }

  if (transcript.isError) {
    return (
      <div className="p-5 sm:p-6">
        <EnterpriseEmptyState
          icon={<MessageSquare className="size-6" aria-hidden />}
          title={t("tickets.360.conversationErrorTitle")}
          description={t("tickets.360.conversationErrorBody")}
        />
      </div>
    );
  }

  const data = transcript.data;
  if (!data || data.denial === "not_found") {
    return (
      <div className="p-5 sm:p-6">
        <EnterpriseEmptyState
          icon={<MessageSquare className="size-6" aria-hidden />}
          title={t("tickets.360.noConversationTitle")}
          description={t("tickets.360.noConversationBody")}
        />
      </div>
    );
  }

  if (data.denial === "permission") {
    return (
      <div className="p-5 sm:p-6">
        <EnterpriseEmptyState
          icon={<MessageSquare className="size-6" aria-hidden />}
          title={t("tickets.360.conversationPermissionTitle")}
          description={t("tickets.360.conversationPermissionBody")}
        />
      </div>
    );
  }

  const channelLabel =
    data.channelType || channelType
      ? t(`tickets.channels.${data.channelType || channelType}`, {
          defaultValue: String(data.channelType || channelType),
        })
      : null;

  if (data.messages.length === 0) {
    return (
      <div className="space-y-3 p-5 sm:p-6">
        {channelLabel ? (
          <p className="text-xs text-muted-foreground">
            {t("tickets.columns.channel")}: {channelLabel}
          </p>
        ) : null}
        <EnterpriseEmptyState
          icon={<MessageSquare className="size-6" aria-hidden />}
          title={t("tickets.360.conversationEmptyTitle")}
          description={t("tickets.360.conversationEmptyBody")}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <p>
          {channelLabel ? (
            <>
              {t("tickets.columns.channel")}: {channelLabel}
            </>
          ) : (
            t("tickets.360.conversationRef")
          )}
        </p>
        <p dir="ltr" className="font-mono">
          {conversationId.slice(0, 8)}…
        </p>
      </div>

      <ul className="space-y-2" aria-label={t("tickets.360.tabs.conversation")}>
        {data.messages.map((message) => {
          const outgoing = message.messageType === "outgoing";
          return (
            <li
              key={message.id}
              className={cn(
                "rounded-xl border border-border/50 px-3 py-2.5 text-sm",
                message.isInternalNote && "border-amber-500/30 bg-amber-500/5",
                outgoing && "bg-muted/20",
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {message.isInternalNote
                    ? t("tickets.internalNote")
                    : t(`tickets.360.messageType.${message.messageType}`, {
                        defaultValue: message.messageType,
                      })}
                </p>
                <TicketDateTime
                  value={message.createdAt}
                  locale={i18n.language}
                  className="text-[11px] text-muted-foreground"
                />
              </div>
              <p className="mt-1 whitespace-pre-wrap break-words" dir="auto">
                {message.content?.trim() || "—"}
              </p>
              {message.attachmentUrl ? (
                <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Paperclip className="size-3" aria-hidden />
                  <a
                    href={message.attachmentUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="underline-offset-2 hover:underline"
                    dir="ltr"
                  >
                    {message.attachmentType || t("tickets.360.attachment")}
                  </a>
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
