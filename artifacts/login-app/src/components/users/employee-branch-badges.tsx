import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Props = {
  labels: string[];
  /** How many branch badges to show before collapsing. */
  maxVisible?: number;
  className?: string;
};

export function EmployeeBranchBadges({ labels, maxVisible = 2, className }: Props) {
  const { t } = useTranslation("common");
  const cleaned = labels.map((l) => l.trim()).filter(Boolean);

  if (cleaned.length === 0) {
    return (
      <span className="text-xs text-muted-foreground">
        {t("companyWorkspace.employees.notAssigned")}
      </span>
    );
  }

  const visible = cleaned.slice(0, maxVisible);
  const remaining = cleaned.length - visible.length;

  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      {visible.map((label) => (
        <Badge
          key={label}
          variant="outline"
          className="max-w-[9rem] truncate border-border/60 bg-card px-2 py-0 text-[10px] font-medium text-foreground"
          title={label}
        >
          {label}
        </Badge>
      ))}
      {remaining > 0 ? (
        <Badge
          variant="secondary"
          className="px-2 py-0 text-[10px] font-medium"
          title={cleaned.slice(maxVisible).join(", ")}
        >
          {t("companyWorkspace.employees.moreBranches", { count: remaining })}
        </Badge>
      ) : null}
    </div>
  );
}
