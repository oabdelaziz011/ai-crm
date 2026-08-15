import { Sparkles, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { WorkspaceAiInsights } from "@/components/customer-workspace/workspace-ai-insights";
import { WorkspaceTabFrame } from "@/components/customer-workspace/workspace-tab-frame";
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
  const RiskIcon = ai.risk === "low" ? CheckCircle2 : AlertTriangle;

  return (
    <WorkspaceTabFrame
      title={t("dashboard.customerWorkspace.tabs.ai")}
      subtitle={t("dashboard.customerWorkspace.ai.label")}
    >
      <div className="space-y-4 p-4">
        <WorkspaceAiInsights insights={insights} />

        <section className="rounded-xl border border-border/60 bg-background p-4">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Sparkles className="size-5 text-primary" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
                {t("dashboard.customerWorkspace.ai.label")}
              </p>
              <h3 className="mt-1 text-base font-semibold tracking-tight">
                {t(ai.summaryKey, ai.params)}
              </h3>
            </div>
          </div>
        </section>

        <section
          className={cn(
            "flex items-center gap-3 rounded-xl border px-4 py-3",
            ai.risk === "low" && "border-success/30 bg-success/10 text-success",
            ai.risk === "medium" && "border-warning/30 bg-warning/10 text-warning",
            ai.risk === "high" && "border-destructive/30 bg-destructive/10 text-destructive",
          )}
        >
          <RiskIcon className="size-5 shrink-0" />
          <p className="text-sm font-semibold">
            {t("dashboard.customerWorkspace.ai.riskLabel")}:{" "}
            {t(`dashboard.customerWorkspace.ai.risk.${ai.risk}`)}
          </p>
        </section>

        <div className="grid gap-3 sm:grid-cols-2">
          <InsightCard title={t("dashboard.customerWorkspace.ai.behaviorTitle")} body={t(ai.behaviorKey, ai.params)} />
          <InsightCard title={t("dashboard.customerWorkspace.ai.missedTitle")} body={t(ai.missedKey, ai.params)} />
        </div>

        <section className="rounded-xl border border-border/60 bg-background p-4">
          <p className="text-sm font-semibold">{t("dashboard.customerWorkspace.ai.recommendedTitle")}</p>
          <p className="mt-2 text-sm text-muted-foreground">{t(ai.actionKey, ai.params)}</p>
        </section>
      </div>
    </WorkspaceTabFrame>
  );
}

function InsightCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <p className="mt-2 text-sm leading-relaxed">{body}</p>
    </div>
  );
}
