import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import type { BrandHealthStatus } from "@/lib/company-workspace/brand-center/brand-health";
import { cn } from "@/lib/utils";

const STATUS_CLASS: Record<BrandHealthStatus, string> = {
  ready:
    "border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  required_missing:
    "border-transparent bg-red-500/15 text-red-700 dark:text-red-400",
  optional_missing:
    "border-transparent bg-muted text-muted-foreground",
  fallback:
    "border-transparent bg-sky-500/15 text-sky-700 dark:text-sky-400",
};

export function BrandHealthStatusBadge({
  status,
  className,
}: {
  status: BrandHealthStatus;
  className?: string;
}) {
  const { t } = useTranslation("common");
  return (
    <Badge
      variant="outline"
      className={cn("font-medium shadow-none", STATUS_CLASS[status], className)}
    >
      {t(`companyWorkspace.brandCenter.health.status.${status}`)}
    </Badge>
  );
}
