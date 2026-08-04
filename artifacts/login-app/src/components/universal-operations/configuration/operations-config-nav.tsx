import { useTranslation } from "react-i18next";
import type { OperationsConfigTab } from "@workspace/universal-operations-engine";
import { cn } from "@/lib/utils";
import { OPERATIONS_CONFIG_TAB_GROUPS } from "./operations-config-tab-groups";

type Props = {
  activeTab: OperationsConfigTab;
  onTabChange: (tab: OperationsConfigTab) => void;
};

export function OperationsConfigNav({ activeTab, onTabChange }: Props) {
  const { t } = useTranslation("common");

  return (
    <nav className="space-y-4 border-b border-border/60 pb-4" aria-label={t("universalOperations.configuration.navLabel")}>
      {OPERATIONS_CONFIG_TAB_GROUPS.map((group) => (
        <div key={group.id}>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/80">
            {t(group.labelKey)}
          </p>
          <div className="flex flex-wrap gap-2">
            {group.tabs.map((tab) => {
              const active = activeTab === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => onTabChange(tab)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                    active ? "bg-primary/15 text-primary ring-1 ring-primary/25" : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                  )}
                >
                  {t(`universalOperations.configuration.tabs.${tab}`)}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
