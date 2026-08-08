import { useMemo } from "react";
import { MessageSquare } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Lead360ActivityItemDto } from "@workspace/application-layer";
import type { Lead360AiPanelDto } from "@/lib/lead-intelligence/lead360-ai-types";
import { EnterpriseEmptyState } from "@/components/enterprise";
import { ProvenanceLine, humanizeSignal } from "./lead360-ui";
import { cn } from "@/lib/utils";

type EnrichedMessage = {
  id: string;
  body: string;
  at: string;
  channel: string;
  actor: string | null;
  intent?: string | null;
  intentConfidence?: number | null;
  country?: string | null;
  countrySource?: string | null;
};

function inferIntentFromText(text: string): { intent: string; confidence: number } | null {
  const value = text.toLowerCase();
  if (/pric|سعر|تسعير|quote|عرض سعر/.test(value)) {
    return { intent: "Pricing Inquiry", confidence: 0.96 };
  }
  if (/demo|تجربة|عرض حي|live demo/.test(value)) {
    return { intent: "Demo Request", confidence: 0.93 };
  }
  if (/integrat|تكامل|api|whatsapp/.test(value)) {
    return { intent: "Integration", confidence: 0.88 };
  }
  if (/support|دعم|help|مشكلة/.test(value)) {
    return { intent: "Support", confidence: 0.86 };
  }
  return null;
}

/** Presentation-only enrichment — does not call AI providers. */
export function Lead360ConversationTab({
  activities,
  panel,
}: {
  activities: readonly Lead360ActivityItemDto[];
  panel?: Lead360AiPanelDto | null;
}) {
  const { t, i18n } = useTranslation("common");
  const intel = panel?.intelligence;

  const messages = useMemo(() => {
    const rows: EnrichedMessage[] = activities.map((activity) => {
      const body = activity.preview || activity.subject || activity.outcome || "";
      const inferred = inferIntentFromText(body);
      const leadIntent = intel?.intents[0];
      return {
        id: activity.id,
        body,
        at: activity.occurredAt,
        channel: activity.channel,
        actor: activity.actor,
        intent: inferred?.intent ?? (leadIntent ? humanizeSignal(String(leadIntent.value)) : null),
        intentConfidence: inferred?.confidence ?? leadIntent?.confidence ?? null,
        country: intel?.country.country.value ?? null,
        countrySource: intel?.country.country.source ?? null,
      };
    });
    return rows;
  }, [activities, intel]);

  if (messages.length === 0) {
    return (
      <EnterpriseEmptyState
        compact
        icon={<MessageSquare className="size-6" aria-hidden />}
        title={t("leads360.empty.conversationTitle", {
          defaultValue: "No conversation yet",
        })}
        description={t("leads360.empty.conversation", {
          defaultValue:
            "When the customer messages on WhatsApp, email, or other channels, the thread will appear here with AI analysis.",
        })}
      />
    );
  }

  return (
    <div className="space-y-3" role="log" aria-label={t("leads360.tabs.conversation", { defaultValue: "Conversation" })}>
      {messages.map((message) => {
        const isCustomer = !/agent|user|system/i.test(message.actor ?? "");
        return (
          <article
            key={message.id}
            className={cn(
              "animate-in fade-in-0 rounded-xl border border-border/50 p-4 duration-300",
              isCustomer ? "bg-card" : "bg-muted/25",
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                {isCustomer
                  ? t("leads360.conversation.customer", { defaultValue: "Customer" })
                  : t("leads360.conversation.team", { defaultValue: "Team" })}
                <span className="ms-2 font-normal normal-case text-muted-foreground/80">
                  · {message.channel}
                </span>
              </p>
              <time className="text-[11px] text-muted-foreground">
                {new Intl.DateTimeFormat(i18n.language, {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(message.at))}
              </time>
            </div>
            <p className="mt-2 text-[14px] leading-relaxed text-foreground">{message.body || "—"}</p>

            {(message.intent || message.country) && (
              <div className="mt-3 rounded-lg border border-border/40 bg-muted/20 px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("leads360.conversation.aiAnalysis", { defaultValue: "AI Analysis" })}
                </p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {message.intent ? (
                    <div>
                      <p className="text-[11px] text-muted-foreground">
                        {t("leads360.ai.intent", { defaultValue: "Intent" })}
                      </p>
                      <p className="text-[13px] font-medium">{message.intent}</p>
                      <ProvenanceLine confidence={message.intentConfidence} source="conversation" />
                    </div>
                  ) : null}
                  {message.country ? (
                    <div>
                      <p className="text-[11px] text-muted-foreground">
                        {t("leads360.ai.country", { defaultValue: "Country" })}
                      </p>
                      <p className="text-[13px] font-medium">{message.country}</p>
                      <ProvenanceLine
                        confidence={intel?.country.country.confidence}
                        source={message.countrySource}
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
