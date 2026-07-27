import { Sparkles, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { WorkspaceAiInsights } from "@/components/customer-workspace/workspace-ai-insights";
import {
  deriveAiCustomerSummary,
  deriveWorkspaceAiInsights,
} from "@/lib/customer-workspace/customer-workspace-utils";
import type { Booking, Customer, Invoice } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  customer: Customer;
  bookings: Booking[];
  invoices: Invoice[];
};

export function WorkspaceAiSummaryTab({ customer, bookings, invoices }: Props) {
  const { t } = useTranslation("common");
  const ai = deriveAiCustomerSummary(customer, bookings, invoices);
  const insights = deriveWorkspaceAiInsights(customer, bookings, invoices);

  const riskStyles = {
    low: "border-success/30 bg-success/10 text-success",
    medium: "border-warning/30 bg-warning/10 text-warning",
    high: "border-destructive/30 bg-destructive/10 text-destructive",
  };

  const RiskIcon = ai.risk === "low" ? CheckCircle2 : AlertTriangle;

  return (
    <div className="mx-auto max-w-3xl space-y-5 animate-in fade-in duration-300">
      <WorkspaceAiInsights insights={insights} />
      <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card p-6">
        <div className="flex items-start gap-4">
          <div className="flex size-12 items-center justify-center rounded-xl bg-primary/15">
            <Sparkles className="size-6 text-primary" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
              {t("dashboard.customerWorkspace.ai.label")}
            </p>
            <h3 className="mt-1 text-xl font-semibold tracking-tight">
              {t(ai.summaryKey, ai.params)}
            </h3>
          </div>
        </div>
      </div>

      <div className={cn("flex items-center gap-3 rounded-xl border px-4 py-3", riskStyles[ai.risk])}>
        <RiskIcon className="size-5 shrink-0" />
        <div>
          <p className="text-sm font-semibold">
            {t("dashboard.customerWorkspace.ai.riskLabel")}:{" "}
            {t(`dashboard.customerWorkspace.ai.risk.${ai.risk}`)}
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <InsightCard
          title={t("dashboard.customerWorkspace.ai.behaviorTitle")}
          body={t(ai.behaviorKey, ai.params)}
        />
        <InsightCard
          title={t("dashboard.customerWorkspace.ai.missedTitle")}
          body={t(ai.missedKey, ai.params)}
        />
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <p className="text-sm font-semibold">{t("dashboard.customerWorkspace.ai.recommendedTitle")}</p>
        <p className="mt-2 text-sm text-muted-foreground">{t(ai.actionKey, ai.params)}</p>
        <Button size="sm" className="mt-4" variant="secondary">
          {t("dashboard.customerWorkspace.ai.applyAction")}
        </Button>
      </div>
    </div>
  );
}

function InsightCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <p className="mt-2 text-sm leading-relaxed">{body}</p>
    </div>
  );
}
