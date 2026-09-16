import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { Mail } from "lucide-react";
import { DashboardCard } from "@/components/dashboard/ui";
import { Button } from "@/components/ui/button";

/**
 * First-time Email experience when inbound/outbound are not actually configured.
 */
export function EmailFirstTimeOnboarding() {
  const { t } = useTranslation("common");

  return (
    <DashboardCard className="space-y-4 border-primary/15 p-6">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Mail className="h-5 w-5" aria-hidden />
        </div>
        <div>
          <h2 className="text-base font-semibold">{t("emailModule.firstTime.title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("emailModule.firstTime.body")}</p>
        </div>
      </div>
      <ol className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-5">
        {(["connect", "sendReceive", "routing", "tickets", "reply"] as const).map((step, index) => (
          <li key={step} className="rounded-lg border border-border bg-background px-3 py-2">
            <span className="text-xs font-medium text-primary">{index + 1}</span>
            <p className="mt-1 font-medium">{t(`emailModule.firstTime.steps.${step}`)}</p>
          </li>
        ))}
      </ol>
      <Button asChild>
        <Link href="~/dashboard/settings/email">{t("emailModule.setup.cta")}</Link>
      </Button>
    </DashboardCard>
  );
}
