import { Building2, MapPin, Users, Briefcase, Layers } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DashboardCard } from "@/components/dashboard/ui";
import type { BranchWithStats } from "@/lib/company/branches/types";

type BranchCardProps = {
  branch: BranchWithStats;
  onManage?: () => void;
  onEdit?: () => void;
};

export function BranchCard({ branch, onManage, onEdit }: BranchCardProps) {
  const { t } = useTranslation("common");

  const location = [branch.city, branch.state, branch.country].filter(Boolean).join(", ");

  return (
    <DashboardCard className="p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold truncate">{branch.name}</h3>
            {branch.is_primary && (
              <Badge variant="secondary" className="shrink-0">
                {t("branches.primaryBadge")}
              </Badge>
            )}
            <Badge
              variant={branch.status === "active" ? "default" : "outline"}
              className="shrink-0 capitalize"
            >
              {t(`branches.statuses.${branch.status}`)}
            </Badge>
          </div>
          {branch.code && (
            <p className="text-xs text-muted-foreground mt-1 font-mono">{branch.code}</p>
          )}
          {location && (
            <p className="text-sm text-muted-foreground mt-2 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{location}</span>
            </p>
          )}
        </div>
        <Building2 className="w-5 h-5 text-primary shrink-0" />
      </div>

      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="rounded-lg bg-black/20 border border-white/5 p-3">
          <Users className="w-4 h-4 mx-auto text-muted-foreground mb-1" />
          <p className="text-lg font-semibold">{branch.users_count}</p>
          <p className="text-xs text-muted-foreground">{t("branches.stats.users")}</p>
        </div>
        <div className="rounded-lg bg-black/20 border border-white/5 p-3">
          <Briefcase className="w-4 h-4 mx-auto text-muted-foreground mb-1" />
          <p className="text-lg font-semibold">{branch.resources_count}</p>
          <p className="text-xs text-muted-foreground">{t("branches.stats.resources")}</p>
        </div>
        <div className="rounded-lg bg-black/20 border border-white/5 p-3">
          <Layers className="w-4 h-4 mx-auto text-muted-foreground mb-1" />
          <p className="text-lg font-semibold">{branch.services_count}</p>
          <p className="text-xs text-muted-foreground">{t("branches.stats.services")}</p>
        </div>
      </div>

      <div className="flex gap-2 mt-auto">
        {onManage && (
          <Button variant="outline" size="sm" className="flex-1 border-white/10" onClick={onManage}>
            {t("branches.actions.viewDetails")}
          </Button>
        )}
        {onEdit && (
          <Button size="sm" className="flex-1" onClick={onEdit}>
            {t("buttons.edit")}
          </Button>
        )}
      </div>
    </DashboardCard>
  );
}
