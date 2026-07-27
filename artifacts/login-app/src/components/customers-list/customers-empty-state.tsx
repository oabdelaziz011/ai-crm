import { Plus, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

type CustomersEmptyStateProps = {
  variant: "all" | "filtered";
  canCreate?: boolean;
  onCreate?: () => void;
};

export function CustomersEmptyState({
  variant,
  canCreate = false,
  onCreate,
}: CustomersEmptyStateProps) {
  const { t } = useTranslation("common");

  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
      <div className="relative mb-6">
        <div className="h-24 w-24 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
          <Users className="h-10 w-10 text-primary/70" />
        </div>
        <div className="absolute -bottom-1 -end-1 h-8 w-8 rounded-full bg-muted border border-border flex items-center justify-center">
          <Plus className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>
      <h3 className="text-lg font-semibold text-foreground">
        {variant === "all"
          ? t("dashboard.customers.list.empty.title")
          : t("dashboard.customers.list.empty.filteredTitle")}
      </h3>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        {variant === "all"
          ? t("dashboard.customers.list.empty.description")
          : t("dashboard.customers.list.empty.filteredDescription")}
      </p>
      {variant === "all" && canCreate && onCreate && (
        <Button
          onClick={onCreate}
          className="mt-6 bg-primary/20 hover:bg-primary/30 border border-primary/30 text-primary gap-2"
        >
          <Plus className="h-4 w-4" />
          {t("dashboard.customers.list.empty.cta")}
        </Button>
      )}
    </div>
  );
}
