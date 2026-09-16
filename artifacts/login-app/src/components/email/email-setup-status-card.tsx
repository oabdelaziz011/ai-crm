import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, HelpCircle } from "lucide-react";
import { useEmailControlCenter } from "@/hooks/email/use-email-control-center";
import { DashboardCard } from "@/components/dashboard/ui";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { EmailControlCenterCard } from "@/lib/email-workspace/email-control-center-status";

const COLLAPSE_KEY = "valueor.email.setupCard.collapsed";

function actionLabelKey(action: EmailControlCenterCard["action"]): string {
  if (action === "configure") return "emailModule.controlCenter.actions.configure";
  if (action === "fix") return "emailModule.controlCenter.actions.fix";
  if (action === "upgrade") return "emailModule.controlCenter.actions.upgrade";
  return "emailModule.controlCenter.actions.view";
}

/**
 * Email Control Center — live configuration status above the inbox.
 * Collapsed by default when the mailbox is ready so the workspace owns the page.
 */
export function EmailSetupStatusCard() {
  const { t } = useTranslation("common");
  const { snapshot } = useEmailControlCenter();
  const needsSetup = snapshot.cards.some((item) => !item.configured || item.enabled === false);
  const mailboxReady = snapshot.settingsLoaded && snapshot.emailConfigured && !needsSetup;
  const [collapsed, setCollapsed] = useState(true);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!snapshot.settingsLoaded || initializedRef.current) return;
    initializedRef.current = true;
    setCollapsed(!(needsSetup && !mailboxReady));
  }, [snapshot.settingsLoaded, mailboxReady, needsSetup]);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  return (
    <div data-testid="email-control-center" data-collapsed={collapsed ? "true" : "false"}>
    <DashboardCard
      className={cn(
        "border-primary/15 bg-primary/[0.03]",
        collapsed ? "px-3 py-1.5" : "px-3 py-2",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <HelpCircle className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
          <h2 className="shrink-0 text-sm font-semibold leading-none text-foreground">
            {t("emailModule.controlCenter.title")}
          </h2>
          <p className="truncate text-xs leading-none text-muted-foreground">
            {collapsed
              ? snapshot.emailConfigured
                ? t("emailModule.controlCenter.readyBanner")
                : t("emailModule.controlCenter.collapsedNeedsSetup")
              : t("emailModule.controlCenter.body")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {needsSetup ? (
            <Button asChild size="sm" variant="outline" className="h-7 px-2 text-xs">
              <Link href="~/dashboard/settings/email">{t("emailModule.setup.cta")}</Link>
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={toggle}
            aria-expanded={!collapsed}
            aria-label={t("emailModule.setup.toggle")}
            data-testid="email-control-center-toggle"
          >
            {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {!collapsed ? (
        <div className="mt-1.5 overflow-x-auto rounded-md border border-border/70 bg-background/80 px-2 py-1.5">
          <ol className="flex min-w-max items-center gap-1 text-[11px] font-medium leading-none">
            {(
              [
                "receive",
                "identify",
                "classify",
                "route",
                "ticket",
                "review",
                "copilot",
                "send",
              ] as const
            ).map((step, index, arr) => (
              <li key={step} className="flex items-center gap-1">
                <span className="whitespace-nowrap rounded border border-border bg-background px-1.5 py-0.5">
                  {t(`emailModule.howItWorks.steps.${step}`)}
                </span>
                {index < arr.length - 1 ? (
                  <span className="text-muted-foreground" aria-hidden>
                    →
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <ul className="mt-1.5 grid grid-cols-5 gap-1">
        {snapshot.cards.map((item) => {
          const ok =
            item.configured && item.enabled !== false && item.health !== "needs_attention";
          const status = [
            item.configured
              ? t("emailModule.controlCenter.configured")
              : t("emailModule.controlCenter.notConfigured"),
            item.enabled == null
              ? null
              : item.enabled
                ? t("emailModule.controlCenter.enabled")
                : t("emailModule.controlCenter.disabled"),
            item.health === "healthy"
              ? t("emailModule.controlCenter.healthy")
              : item.health === "needs_attention"
                ? t("emailModule.controlCenter.needsAttention")
                : null,
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <li
              key={item.id}
              className={cn(
                "flex min-w-0 items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs leading-none",
                ok ? "border-emerald-200" : "border-amber-200",
              )}
            >
              {ok ? (
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden />
              )}
              <span className="min-w-0 truncate font-medium">
                {t(`emailModule.controlCenter.cards.${item.id}`)}
                <span className="font-normal text-muted-foreground"> · {status}</span>
              </span>
              <Link
                href={item.href}
                className="ms-auto shrink-0 font-medium text-primary underline-offset-2 hover:underline"
              >
                {t(actionLabelKey(item.action))}
              </Link>
            </li>
          );
        })}
      </ul>
    </DashboardCard>
    </div>
  );
}
