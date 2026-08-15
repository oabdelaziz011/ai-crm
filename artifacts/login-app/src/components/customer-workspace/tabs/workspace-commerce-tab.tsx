import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { CustomerProfileTab } from "@/components/customer-profile/types";
import type { CommerceSubTab } from "@/lib/customer-workspace/workspace-navigation";
import { cn } from "@/lib/utils";

type Props = {
  active: CommerceSubTab;
  onChange: (tab: CustomerProfileTab) => void;
  children: ReactNode;
};

export function WorkspaceCommerceTab({ active, onChange, children }: Props) {
  const { t } = useTranslation("common");
  const tabs: CommerceSubTab[] = ["bookings", "invoices", "payments"];

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <nav
        className="flex gap-1 rounded-lg border border-border/60 bg-background p-1"
        aria-label={t("dashboard.customerWorkspace.commerce.navLabel")}
      >
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => onChange(tab)}
            className={cn(
              "flex-1 rounded-md px-3 py-2 text-xs font-semibold transition-all",
              active === tab
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t(`dashboard.customerWorkspace.commerce.${tab}`)}
          </button>
        ))}
      </nav>
      {children}
    </div>
  );
}
