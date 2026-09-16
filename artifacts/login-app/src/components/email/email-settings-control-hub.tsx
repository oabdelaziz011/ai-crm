import { Link, useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import { IdCard, Inbox } from "lucide-react";
import { useEmailControlCenter } from "@/hooks/email/use-email-control-center";
import { DashboardCard } from "@/components/dashboard/ui";
import { useAuthUser } from "@/hooks/use-rbac";
import {
  emailSettingsTabHref,
  resolveEmailSettingsTab,
  type EmailSettingsTabId,
} from "@/lib/email-workspace/email-settings-tabs";
import {
  canAccessEmailIdentityTab,
  canManageEmailConnection,
} from "@/lib/email-workspace/email-identity-permissions";
import { cn } from "@/lib/utils";

const TABS: {
  id: EmailSettingsTabId;
  icon: typeof Inbox;
  titleKey: string;
}[] = [
  {
    id: "connection",
    icon: Inbox,
    titleKey: "emailModule.settingsHub.tabs.connection",
  },
  {
    id: "identity",
    icon: IdCard,
    titleKey: "emailModule.settingsHub.tabs.identity",
  },
];

type Props = {
  activeTab?: ReturnType<typeof resolveEmailSettingsTab>;
};

/**
 * Email Settings internal tab navigation — Connection + Email Identity only.
 */
export function EmailSettingsControlHub({ activeTab }: Props) {
  const { t } = useTranslation("common");
  const { snapshot } = useEmailControlCenter();
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const showConnection = canManageEmailConnection(hasPermission, isSuperAdmin);
  const showIdentity = canAccessEmailIdentityTab(hasPermission, isSuperAdmin);
  const visibleTabs = TABS.filter((tab) =>
    tab.id === "connection" ? showConnection : showIdentity,
  );
  const search = useSearch();
  const resolvedTab =
    activeTab ??
    resolveEmailSettingsTab({
      search,
      hash: typeof window !== "undefined" ? window.location.hash : "",
    });

  return (
    <div className="space-y-4">
      <DashboardCard className="space-y-3 border-primary/15 bg-primary/[0.03] p-5">
        <h2 className="text-base font-semibold">{t("emailModule.controlCenter.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("emailModule.settingsHub.intro")}</p>
        <nav
          className="flex flex-wrap gap-1.5"
          aria-label={t("emailModule.settingsHub.tabsNav")}
          data-testid="email-settings-tabs"
        >
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            const href = emailSettingsTabHref(tab.id);
            const active = resolvedTab === tab.id;
            return (
              <Link
                key={tab.id}
                href={href}
                data-testid={`email-settings-tab-${tab.id}`}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:bg-muted border border-border",
                )}
              >
                <Icon className="size-3.5" aria-hidden />
                {t(tab.titleKey)}
              </Link>
            );
          })}
        </nav>
        <p className="text-xs text-muted-foreground">
          {snapshot.emailConfigured
            ? t("emailModule.controlCenter.readyBanner")
            : t("emailModule.controlCenter.collapsedNeedsSetup")}
        </p>
      </DashboardCard>
    </div>
  );
}
