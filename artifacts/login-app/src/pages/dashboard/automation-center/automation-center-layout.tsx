import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { AutomationCenterWorkflowsPage } from "@/pages/dashboard/automation-center/automation-center-workflows-page";
import { AutomationCenterEditorPage } from "@/pages/dashboard/automation-center/automation-center-editor-page";
import { AutomationCenterHistoryPage } from "@/pages/dashboard/automation-center/automation-center-history-page";
import { AutomationCenterTemplatesPage } from "@/pages/dashboard/automation-center/automation-center-templates-page";

const BASE = "/dashboard/automation/center";

export function AutomationCenterLayout() {
  const { t } = useTranslation("common");
  const [location] = useLocation();

  const navItems = [
    { href: BASE, label: t("automation.center.nav.workflows"), match: (path: string) => path === BASE },
    { href: `${BASE}/history`, label: t("automation.center.nav.history"), match: (path: string) => path.startsWith(`${BASE}/history`) },
    { href: `${BASE}/templates`, label: t("automation.center.nav.templates"), match: (path: string) => path.startsWith(`${BASE}/templates`) },
  ];

  const renderPage = () => {
    if (location.startsWith(`${BASE}/editor/`)) return <AutomationCenterEditorPage />;
    if (location.startsWith(`${BASE}/history`)) return <AutomationCenterHistoryPage />;
    if (location.startsWith(`${BASE}/templates`)) return <AutomationCenterTemplatesPage />;
    if (location === BASE || location.startsWith(`${BASE}/`)) return <AutomationCenterWorkflowsPage />;
    return <AutomationCenterWorkflowsPage />;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("automation.center.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("automation.center.subtitle")}</p>
      </div>

      <nav className="flex flex-wrap gap-2">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "rounded-xl px-3 py-1.5 text-sm transition",
              item.match(location) ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted/50",
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {renderPage()}
    </div>
  );
}
