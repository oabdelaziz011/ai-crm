import { useTranslation } from "react-i18next";
import type { CompanyStatus } from "@/lib/types";

type CompanyStatusBadgeProps = {
  status: CompanyStatus;
};

export function CompanyStatusBadge({ status }: CompanyStatusBadgeProps) {
  const { t } = useTranslation("common");
  const classes =
    status === "Active"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
      : status === "Suspended"
        ? "border-rose-500/30 bg-rose-500/10 text-rose-400"
        : "border-amber-500/30 bg-amber-500/10 text-amber-400";

  return (
    <span className={`text-xs font-mono px-2.5 py-1 rounded-full border ${classes}`}>
      {t(`status.${status.toLowerCase()}`)}
    </span>
  );
}

export function companyStatusLabel(status: CompanyStatus, t: (key: string) => string): string {
  return t(`status.${status.toLowerCase()}`);
}
