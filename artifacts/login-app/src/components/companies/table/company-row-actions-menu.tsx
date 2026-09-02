import { MoreVertical } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Company } from "@/lib/types";
import {
  visibleCompanyRowActions,
  type CompanyRowActionCapabilities,
  type CompanyRowActionId,
} from "@/lib/companies/company-row-actions";

const DESTRUCTIVE_ACTIONS = new Set<CompanyRowActionId>([
  "delete",
  "reject",
  "suspend",
  "resetAdminPassword",
]);

export function CompanyRowActionsMenu({
  company,
  capabilities,
  onAction,
}: {
  company: Company;
  capabilities: CompanyRowActionCapabilities;
  onAction: (id: CompanyRowActionId) => void;
}) {
  const { t } = useTranslation("common");
  const actions = visibleCompanyRowActions(company, capabilities);
  if (actions.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-9 w-9 border-border bg-background shadow-sm"
          aria-label={t("companies.actions.menu")}
        >
          <MoreVertical className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuLabel>{t("companies.actions.menuTitle")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {actions.map((action, index) => {
          const previous = actions[index - 1];
          const showSeparator =
            previous &&
            (previous.id === "edit" || previous.id === "retryProvisioning" || previous.id === "restore") &&
            (action.id === "features" || action.id === "suspend" || action.id === "delete");
          return (
            <span key={action.id}>
              {showSeparator ? <DropdownMenuSeparator /> : null}
              <DropdownMenuItem
                className={DESTRUCTIVE_ACTIONS.has(action.id) ? "text-destructive focus:text-destructive" : undefined}
                onSelect={(event) => {
                  event.preventDefault();
                  window.setTimeout(() => onAction(action.id), 0);
                }}
              >
                {t(`companies.actions.${action.id}`)}
              </DropdownMenuItem>
            </span>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
