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

  const channelCode = data.channelType || channelType;
  const channelLabel = channelCode
    ? t(`tickets.channels.${channelCode}`, { defaultValue: channelCode })
    : null;

  const metaBar = (
    <div className="grid gap-2 rounded-xl border border-border/50 bg-muted/10 px-3.5 py-3 text-xs sm:grid-cols-3">
      <div>
        <p className="text-[11px] font-medium text-muted-foreground">{t("tickets.columns.channel")}</p>
        <p className="mt-0.5 text-sm font-medium text-foreground">
          {channelLabel || t("tickets.360.noChannel")}
        </p>
      </div>
      <div>
        <p className="text-[11px] font-medium text-muted-foreground">{t("tickets.360.conversationRef")}</p>
        <p dir="ltr" className="mt-0.5 font-mono text-sm font-medium tabular-nums text-foreground">
          {conversationId.slice(0, 8)}…
        </p>
      </div>
      <div>
        <p className="text-[11px] font-medium text-muted-foreground">{t("tickets.360.messageCountLabel")}</p>
        <p className="mt-0.5 text-sm font-medium text-foreground">
          {t("tickets.360.messageCount", { count: data.messages.length })}
        </p>
      </div>
    </div>
  );

  if (data.messages.length === 0) {
    return (
      <div className="space-y-3 p-5 sm:p-6">
        {metaBar}
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
      {metaBar}

      <ul className="space-y-2" aria-label={t("tickets.360.tabs.conversation")}>
        {data.messages.map((message) => {
          const outgoing = message.messageType === "outgoing";
          const typeKey = `tickets.360.messageType.${message.messageType}`;
          const typeLabel = message.isInternalNote
            ? t("tickets.internalNote")
            : i18n.exists(typeKey)
              ? t(typeKey)
              : t("tickets.360.messageType.system");
          return (
            <li
              key={message.id}
              className={cn(
                "rounded-xl border border-border/50 px-3.5 py-3 text-sm",
                message.isInternalNote && "border-amber-500/30 bg-amber-500/5",
                outgoing && !message.isInternalNote && "bg-muted/20",
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="rounded-md bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  {typeLabel}
                </span>
                <TicketDateTime
                  value={message.createdAt}
                  locale={i18n.language}
                  className="text-[11px] tabular-nums text-muted-foreground"
                />
              </div>
              <p className="mt-2 whitespace-pre-wrap break-words leading-relaxed" dir="auto">
                {message.content?.trim() || "—"}
              </p>
              {message.attachmentUrl ? (
                <p className="mt-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
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
