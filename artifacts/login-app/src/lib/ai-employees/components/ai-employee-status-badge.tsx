import { memo } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import type { AiEmployeeStatus } from "@/lib/ai-employees/types";
import { cn } from "@/lib/utils";

const STATUS_VARIANT: Record<AiEmployeeStatus, "default" | "secondary" | "outline" | "destructive"> = {
  published: "default",
  draft: "secondary",
  disabled: "outline",
  archived: "destructive",
};

export const AiEmployeeStatusBadge = memo(function AiEmployeeStatusBadge({
  status,
  className,
}: {
  status: AiEmployeeStatus;
  className?: string;
}) {
  const { t } = useTranslation("common");

  return (
    <Badge variant={STATUS_VARIANT[status]} className={cn("capitalize", className)}>
      {t(`aiEmployees.status.${status}`)}
    </Badge>
  );
});
