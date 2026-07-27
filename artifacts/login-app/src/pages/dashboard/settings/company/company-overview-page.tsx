import { Building2, Briefcase, GitBranch, Layers, Users } from "lucide-react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/auth-context";
import { safeDisplayText } from "@/lib/profile/display-safe";
import { DashboardCard, DashboardStatCard } from "@/components/dashboard/ui";
import { Button } from "@/components/ui/button";
import { useCompanyBranchStats, useBranches } from "@/lib/company/branches/hooks";
import { nestedSectionHref } from "@/lib/routing";

export function CompanyOverviewPage() {
  const { t } = useTranslation("common");
  const { company } = useAuth();
  const companyId = company?.id ?? null;
  const empty = t("common.none");

  const { data: stats, isLoading: statsLoading } = useCompanyBranchStats(companyId);
  const { data: branches = [], isLoading: branchesLoading } = useBranches(companyId);

  const fields = [
    {
      label: t("profiles.fields.company"),
      value: safeDisplayText(company?.name) ?? empty,
    },
    {
      label: t("common.status"),
      value: safeDisplayText(company?.status) ?? empty,
    },
  ];

  return (
    <div className="space-y-6">
      <DashboardCard className="p-6">
        <h3 className="font-semibold mb-5 flex items-center gap-2">
          <Building2 className="w-4 h-4 text-primary" />
          {t("branches.companyDetails")}
        </h3>
        <div className="space-y-3">
          {fields.map((field) => (
            <div
              key={field.label}
              className="flex items-start gap-4 p-4 bg-black/20 rounded-xl border border-white/5"
            >
              <Building2 className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">{field.label}</p>
                <p className="text-sm font-medium mt-0.5 break-words">{field.value}</p>
              </div>
            </div>
          ))}
        </div>
      </DashboardCard>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <DashboardStatCard
          label={t("branches.stats.branches")}
          value={statsLoading ? "—" : String(stats?.branches ?? 0)}
          icon={GitBranch}
        />
        <DashboardStatCard
          label={t("branches.stats.users")}
          value={statsLoading ? "—" : String(stats?.users ?? 0)}
          icon={Users}
        />
        <DashboardStatCard
          label={t("branches.stats.resources")}
          value={statsLoading ? "—" : String(stats?.resources ?? 0)}
          icon={Briefcase}
        />
        <DashboardStatCard
          label={t("branches.stats.services")}
          value={statsLoading ? "—" : String(stats?.services ?? 0)}
          icon={Layers}
        />
      </div>

      <DashboardCard className="p-6">
        <div className="flex items-center justify-between gap-4 mb-5">
          <div>
            <h3 className="font-semibold">{t("branches.listTitle")}</h3>
            <p className="text-sm text-muted-foreground mt-1">{t("branches.listPreviewSubtitle")}</p>
          </div>
          <Link href={nestedSectionHref("/branches")}>
            <Button size="sm">{t("branches.actions.manageBranches")}</Button>
          </Link>
        </div>

        {branchesLoading ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : branches.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("branches.empty")}</p>
        ) : (
          <ul className="space-y-2">
            {branches.slice(0, 5).map((branch) => (
              <li
                key={branch.id}
                className="flex items-center justify-between gap-3 p-3 rounded-xl bg-black/20 border border-white/5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {branch.name}
                    {branch.is_primary && (
                      <span className="ml-2 text-xs text-primary">({t("branches.primaryBadge")})</span>
                    )}
                  </p>
                  {branch.city && (
                    <p className="text-xs text-muted-foreground truncate">{branch.city}</p>
                  )}
                </div>
                <span className="text-xs capitalize text-muted-foreground shrink-0">
                  {t(`branches.statuses.${branch.status}`)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </DashboardCard>
    </div>
  );
}
