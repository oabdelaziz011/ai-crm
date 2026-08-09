import {
  FileText,
  Loader2,
  Mail,
  MessageCircle,
  MoreHorizontal,
  Phone,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { OpportunityReadModel } from "@workspace/application-layer";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LeadsAvatar } from "@/components/leads/workspace/leads-avatar";
import {
  emptyDisplayValue,
  formatOpportunityDate,
  formatOpportunityMoney,
} from "./opportunity360-ui";

export type Opportunity360HeaderLeadContext = {
  phone?: string | null;
  email?: string | null;
};

function normalizeWhatsAppPhone(phone: string): string {
  return phone.replace(/[^\d+]/g, "");
}

export function Opportunity360Header({
  opportunity,
  leadContext,
  canArchive,
  canCreateQuote,
  createQuotePending,
  updatePending,
  onArchive,
  onClose,
  onOpenLead,
  onCreateQuote,
  locale,
}: {
  opportunity: OpportunityReadModel;
  leadContext?: Opportunity360HeaderLeadContext | null;
  canArchive: boolean;
  canCreateQuote: boolean;
  createQuotePending: boolean;
  updatePending: boolean;
  onArchive: () => void;
  onClose: () => void;
  onOpenLead?: (leadId: string) => void;
  onCreateQuote?: () => void;
  locale: string;
}) {
  const { t } = useTranslation("common");
  const empty = emptyDisplayValue(t);

  const contextLine =
    [opportunity.companyName, opportunity.primaryContact].filter(Boolean).join(" · ") || empty;

  const phone = leadContext?.phone?.trim() || "";
  const email = leadContext?.email?.trim() || "";
  const waPhone = phone ? normalizeWhatsAppPhone(phone) : "";
  const leadId = opportunity.leadId?.trim() || null;
  const canOpenLead = Boolean(leadId && onOpenLead);

  return (
    <header className="shrink-0 border-b border-border/50 bg-background px-5 py-4 sm:px-7">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3.5">
          <LeadsAvatar name={opportunity.name} size="lg" />
          <div className="min-w-0 flex-1 space-y-3">
            <div className="space-y-1">
              <h2 className="truncate text-[1.25rem] font-semibold tracking-[-0.02em] text-foreground">
                {opportunity.name}
              </h2>
              <p className="truncate text-[13px] text-muted-foreground">{contextLine}</p>
              <p className="truncate text-[12px] text-muted-foreground">
                {[
                  `${t("opportunities360.fields.owner")}: ${opportunity.owner?.trim() || empty}`,
                  formatOpportunityMoney(opportunity.expectedRevenue, opportunity.currency) || null,
                  formatOpportunityDate(opportunity.expectedCloseDate, locale) || null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {phone ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 rounded-md px-2.5 text-[12px]"
                  asChild
                >
                  <a href={`tel:${phone}`}>
                    <Phone className="size-3.5" aria-hidden />
                    {t("opportunities360.actions.call")}
                  </a>
                </Button>
              ) : null}
              {email ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 rounded-md px-2.5 text-[12px]"
                  asChild
                >
                  <a href={`mailto:${email}`}>
                    <Mail className="size-3.5" aria-hidden />
                    {t("opportunities360.actions.email")}
                  </a>
                </Button>
              ) : null}
              {waPhone ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 rounded-md px-2.5 text-[12px]"
                  asChild
                >
                  <a
                    href={`https://wa.me/${waPhone.replace("+", "")}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <MessageCircle className="size-3.5" aria-hidden />
                    {t("opportunities360.actions.whatsapp")}
                  </a>
                </Button>
              ) : null}

              {onCreateQuote ? (
                <Button
                  type="button"
                  size="sm"
                  className="h-8 gap-1.5 rounded-md px-3 text-[12px] font-semibold"
                  disabled={createQuotePending || !canCreateQuote}
                  onClick={onCreateQuote}
                >
                  {createQuotePending ? (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  ) : (
                    <FileText className="size-3.5" aria-hidden />
                  )}
                  {t("opportunities360.actions.createQuote")}
                </Button>
              ) : null}

              {canOpenLead ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-8 gap-1.5 rounded-md px-2.5 text-[12px]"
                  onClick={() => onOpenLead!(leadId!)}
                >
                  <UserRound className="size-3.5" aria-hidden />
                  {t("opportunities360.actions.openLead")}
                </Button>
              ) : null}

              {canArchive ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-8 rounded-md"
                      aria-label={t("opportunities360.actions.more")}
                    >
                      <MoreHorizontal className="size-4" aria-hidden />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="min-w-[180px]">
                    <DropdownMenuItem
                      disabled={updatePending}
                      className="text-destructive focus:text-destructive"
                      onClick={onArchive}
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                      {t("opportunities360.actions.archive")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>
          </div>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 shrink-0 rounded-md"
          onClick={onClose}
          aria-label={t("opportunities360.close")}
        >
          <X className="size-4" />
        </Button>
      </div>
    </header>
  );
}
