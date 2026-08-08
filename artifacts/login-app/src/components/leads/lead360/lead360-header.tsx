import { Flame, Mail, MessageCircle, Phone, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { LeadsAvatar } from "@/components/leads/workspace/leads-avatar";
import { LeadsStageBadge } from "@/components/leads/workspace/leads-stage-badge";
import { translateLeadStageLabel } from "@/components/leads/kanban/lead-stage-label";
import type { LeadReadModel } from "@workspace/application-layer";
import type { Lead360AiPanelDto } from "@/lib/lead-intelligence/lead360-ai-types";
import { cn } from "@/lib/utils";

function formatRelative(value: string | null | undefined, locale: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function Lead360Header({
  lead,
  panel,
  onClose,
}: {
  lead: LeadReadModel;
  panel?: Lead360AiPanelDto | null;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation("common");
  const intel = panel?.intelligence;
  const score = intel?.score.overall.value ?? lead.score;
  const temperature = intel?.temperature.value ?? lead.temperature;
  const country = intel?.country.country.value;
  const market = intel?.country.market.value;
  const intent = intel?.intents[0]?.value;
  const phone = lead.phone;
  const email = lead.email;
  const waPhone = phone?.replace(/[^\d+]/g, "") ?? "";
  const stageLabel = translateLeadStageLabel(t, {
    name: lead.stage,
    lifecycleStatus: lead.lifecycleStatus,
    slug: lead.stage,
  });
  const displayName = lead.contactPerson || lead.name;

  return (
    <header className="shrink-0 border-b border-border/60 bg-gradient-to-b from-muted/25 via-muted/10 to-transparent px-5 py-5 sm:px-8">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-4">
          <LeadsAvatar name={displayName} size="xl" />
          <div className="min-w-0 flex-1 space-y-3">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <h2 className="truncate text-[1.4rem] font-semibold tracking-[-0.03em] text-foreground">
                  {displayName}
                </h2>
                {temperature ? (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[12px] font-semibold",
                      temperature === "hot" && "bg-orange-500/15 text-orange-700 dark:text-orange-300",
                      temperature === "warm" && "bg-amber-500/15 text-amber-700 dark:text-amber-300",
                      temperature === "cold" && "bg-sky-500/15 text-sky-700 dark:text-sky-300",
                    )}
                  >
                    {temperature === "hot" ? <Flame className="size-3.5" aria-hidden /> : null}
                    {t(`leads.scoreBand.${temperature}`)}
                  </span>
                ) : null}
                <span className="text-[13px] font-semibold tabular-nums text-foreground/90">
                  {t("leads360.aiScore", { score: Math.round(score) })}
                </span>
              </div>

              <p className="truncate text-[13px] leading-5 text-muted-foreground">
                {[
                  lead.companyName,
                  country,
                  intel?.memoryFacts?.find((f) => /employee/i.test(f.factKey))?.factValue,
                  intent ? humanIntent(intent) : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || t("leads360.empty.company")}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
              <LeadsStageBadge label={stageLabel} lifecycleStatus={lead.lifecycleStatus} />
              {market ? <span>{market}</span> : null}
              {lead.owner ? (
                <span>
                  · {t("leads.columns.owner")}: {lead.owner}
                </span>
              ) : null}
              <span>· {formatRelative(lead.lastActivityAt, i18n.language)}</span>
            </div>

            <div className="flex flex-wrap gap-2 pt-0.5">
              {phone ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-9 gap-1.5 rounded-lg px-3 text-[13px] font-medium"
                  asChild
                >
                  <a href={`tel:${phone}`}>
                    <Phone className="size-3.5" aria-hidden />
                    {t("leads.workspace.actions.call")}
                  </a>
                </Button>
              ) : null}
              {email ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-9 gap-1.5 rounded-lg px-3 text-[13px] font-medium"
                  asChild
                >
                  <a href={`mailto:${email}`}>
                    <Mail className="size-3.5" aria-hidden />
                    {t("leads.workspace.actions.email")}
                  </a>
                </Button>
              ) : null}
              {waPhone ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-9 gap-1.5 rounded-lg px-3 text-[13px] font-medium"
                  asChild
                >
                  <a
                    href={`https://wa.me/${waPhone.replace("+", "")}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <MessageCircle className="size-3.5" aria-hidden />
                    {t("leads.workspace.actions.whatsapp")}
                  </a>
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-9 shrink-0 rounded-lg"
          onClick={onClose}
          aria-label={t("common.close", { defaultValue: "Close" })}
        >
          <X className="size-4" />
        </Button>
      </div>
    </header>
  );
}

function humanIntent(intent: string): string {
  return intent.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
