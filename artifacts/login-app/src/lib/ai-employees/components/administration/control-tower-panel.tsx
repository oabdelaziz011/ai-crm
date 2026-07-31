import { memo } from "react";
import {
  Activity,
  AlertTriangle,
  Brain,
  ClipboardList,
  Coins,
  Cpu,
  Network,
  Server,
  Shield,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { DashboardCard, DashboardStatCard } from "@/components/dashboard/ui";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { AiControlTowerSnapshot, AiEmployeeRecord } from "@/lib/ai-employees/types";
import type { useControlTowerEmployeeFilter } from "@/lib/ai-employees/hooks/use-ai-employee-administration";

type ControlTowerPanelProps = {
  employee: AiEmployeeRecord;
  snapshot: AiControlTowerSnapshot | null;
  isLoading: boolean;
  employeeFilter: ReturnType<typeof useControlTowerEmployeeFilter>;
};

export const ControlTowerPanel = memo(function ControlTowerPanel({
  snapshot,
  isLoading,
  employeeFilter,
}: ControlTowerPanelProps) {
  const { t } = useTranslation("common");

  return (
    <section className="space-y-4">
      <DashboardCard className="space-y-4 p-5">
        <div>
          <h2 className="text-lg font-semibold">{t("aiEmployees.administration.title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("aiEmployees.administration.subtitle")}</p>
        </div>
      </DashboardCard>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <DashboardStatCard
          label={t("aiEmployees.administration.overview.employees")}
          value={snapshot?.globalOverview.employeeCount ?? "—"}
          icon={Users}
        />
        <DashboardStatCard
          label={t("aiEmployees.administration.overview.skills")}
          value={snapshot?.globalOverview.skillCount ?? "—"}
          icon={Sparkles}
        />
        <DashboardStatCard
          label={t("aiEmployees.administration.overview.activeRuntime")}
          value={snapshot?.globalOverview.activeRuntimeCount ?? "—"}
          icon={Activity}
        />
        <DashboardStatCard
          label={t("aiEmployees.administration.overview.executions")}
          value={snapshot?.globalOverview.executionsToday ?? "—"}
          icon={Zap}
        />
        <DashboardStatCard
          label={t("aiEmployees.administration.overview.successRate")}
          value={snapshot ? `${snapshot.globalOverview.successRate}%` : "—"}
          icon={Network}
        />
        <DashboardStatCard
          label={t("aiEmployees.administration.overview.health")}
          value={snapshot ? `${snapshot.globalOverview.healthScore}%` : "—"}
          icon={Shield}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <DashboardCard className="space-y-4 p-5 xl:col-span-2">
          <SectionTitle icon={Users} title={t("aiEmployees.administration.employees.title")} />
          <div className="flex flex-wrap gap-2">
            <Input
              className="max-w-xs rounded-xl"
              placeholder={t("aiEmployees.administration.employees.searchPlaceholder")}
              value={employeeFilter.search}
              onChange={(event) => employeeFilter.setSearch(event.target.value)}
            />
            <select
              className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
              value={employeeFilter.status}
              onChange={(event) => employeeFilter.setStatus(event.target.value)}
            >
              <option value="all">{t("aiEmployees.filters.all")}</option>
              <option value="published">{t("aiEmployees.status.published")}</option>
              <option value="draft">{t("aiEmployees.status.draft")}</option>
              <option value="disabled">{t("aiEmployees.status.disabled")}</option>
            </select>
            <select
              className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
              value={employeeFilter.department}
              onChange={(event) => employeeFilter.setDepartment(event.target.value)}
            >
              <option value="all">{t("aiEmployees.filters.all")}</option>
              {employeeFilter.departments.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </div>
          {employeeFilter.filteredEmployees.length > 0 ? (
            <ul className="space-y-2">
              {employeeFilter.filteredEmployees.slice(0, 10).map((entry) => (
                <li key={entry.employee.id} className="flex items-center justify-between rounded-xl border border-border/60 px-3 py-2 text-sm">
                  <div>
                    <span className="font-medium">{entry.employee.displayName}</span>
                    <p className="text-xs text-muted-foreground">
                      {entry.department ?? "—"} · {entry.owner ?? "—"}
                    </p>
                  </div>
                  <Badge variant="outline">{entry.status}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState loading={isLoading} message={t("aiEmployees.administration.employees.empty")} />
          )}
        </DashboardCard>

        <DashboardCard className="space-y-4 p-5">
          <SectionTitle icon={Sparkles} title={t("aiEmployees.administration.skills.title")} />
          {snapshot ? (
            <>
              <DetailRow label={t("aiEmployees.administration.skills.total")} value={String(snapshot.skillsAdmin.totalSkills)} />
              <DetailRow label={t("aiEmployees.administration.skills.published")} value={String(snapshot.skillsAdmin.publishedSkills)} />
              <DetailRow label={t("aiEmployees.administration.skills.assignments")} value={String(snapshot.skillsAdmin.totalAssignments)} />
              <DetailRow label={t("aiEmployees.administration.skills.usage")} value={String(snapshot.skillsAdmin.usageCount)} />
            </>
          ) : (
            <EmptyState loading={isLoading} />
          )}
        </DashboardCard>

        <DashboardCard className="space-y-4 p-5">
          <SectionTitle icon={Server} title={t("aiEmployees.administration.runtime.title")} />
          {snapshot ? (
            <>
              <DetailRow label={t("aiEmployees.administration.runtime.online")} value={String(snapshot.runtimeAdmin.online)} />
              <DetailRow label={t("aiEmployees.administration.runtime.offline")} value={String(snapshot.runtimeAdmin.offline)} />
              <DetailRow label={t("aiEmployees.administration.runtime.busy")} value={String(snapshot.runtimeAdmin.busy)} />
              <DetailRow label={t("aiEmployees.administration.runtime.queue")} value={String(snapshot.runtimeAdmin.queueLength)} />
              <DetailRow label={t("aiEmployees.administration.runtime.workers")} value={String(snapshot.runtimeAdmin.workers)} />
            </>
          ) : (
            <EmptyState loading={isLoading} />
          )}
        </DashboardCard>

        <DashboardCard className="space-y-4 p-5">
          <SectionTitle icon={Cpu} title={t("aiEmployees.administration.providers.title")} />
          {snapshot && snapshot.providerAdmin.providers.length > 0 ? (
            <ul className="space-y-2">
              {snapshot.providerAdmin.providers.slice(0, 6).map((provider) => (
                <li key={provider.key} className="flex items-center justify-between text-sm">
                  <span>{provider.key}</span>
                  <Badge variant="outline">{provider.health}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState loading={isLoading} />
          )}
        </DashboardCard>

        <DashboardCard className="space-y-4 p-5">
          <SectionTitle icon={Coins} title={t("aiEmployees.administration.costs.title")} />
          {snapshot ? (
            <>
              <DetailRow
                label={t("aiEmployees.administration.costs.daily")}
                value={formatCurrency(snapshot.costAdmin.dailyCost, snapshot.costAdmin.currency)}
              />
              <DetailRow
                label={t("aiEmployees.administration.costs.monthly")}
                value={formatCurrency(snapshot.costAdmin.monthlyCost, snapshot.costAdmin.currency)}
              />
              <DetailRow label={t("aiEmployees.administration.costs.requests")} value={String(snapshot.costAdmin.requests)} />
            </>
          ) : (
            <EmptyState loading={isLoading} />
          )}
        </DashboardCard>

        <DashboardCard className="space-y-4 p-5">
          <SectionTitle icon={Brain} title={t("aiEmployees.administration.memory.title")} />
          {snapshot ? (
            <>
              <DetailRow label={t("aiEmployees.administration.memory.usage")} value={`${snapshot.memoryAdmin.memoryUsagePercent}%`} />
              <DetailRow label={t("aiEmployees.administration.memory.context")} value={String(snapshot.memoryAdmin.contextSizeTokens)} />
              <DetailRow label={t("aiEmployees.administration.memory.retrievals")} value={String(snapshot.memoryAdmin.retrievalCount)} />
            </>
          ) : (
            <EmptyState loading={isLoading} />
          )}
        </DashboardCard>

        <DashboardCard className="space-y-4 p-5">
          <SectionTitle icon={Network} title={t("aiEmployees.administration.collaboration.title")} />
          {snapshot ? (
            <>
              <DetailRow label={t("aiEmployees.administration.collaboration.groups")} value={String(snapshot.collaborationAdmin.groupCount)} />
              <DetailRow label={t("aiEmployees.administration.collaboration.handovers")} value={String(snapshot.collaborationAdmin.handoverCount)} />
              <DetailRow label={t("aiEmployees.administration.collaboration.success")} value={`${snapshot.collaborationAdmin.handoverSuccessRate}%`} />
            </>
          ) : (
            <EmptyState loading={isLoading} />
          )}
        </DashboardCard>

        <DashboardCard className="space-y-4 p-5">
          <SectionTitle icon={Shield} title={t("aiEmployees.administration.governance.title")} />
          {snapshot ? (
            <>
              <DetailRow label={t("aiEmployees.administration.governance.policies")} value={String(snapshot.governanceAdmin.policyCount)} />
              <DetailRow label={t("aiEmployees.administration.governance.violations")} value={String(snapshot.governanceAdmin.violationCount)} />
              <DetailRow label={t("aiEmployees.administration.governance.compliance")} value={`${snapshot.governanceAdmin.complianceScore}%`} />
              <DetailRow label={t("aiEmployees.administration.governance.risk")} value={snapshot.governanceAdmin.riskLevel} />
            </>
          ) : (
            <EmptyState loading={isLoading} />
          )}
        </DashboardCard>

        <DashboardCard className="space-y-4 p-5">
          <SectionTitle icon={Zap} title={t("aiEmployees.administration.executions.title")} />
          {snapshot ? (
            <>
              <DetailRow label={t("aiEmployees.administration.executions.total")} value={String(snapshot.executionAdmin.totalExecutions)} />
              <DetailRow label={t("aiEmployees.administration.executions.running")} value={String(snapshot.executionAdmin.running)} />
              <DetailRow label={t("aiEmployees.administration.executions.failed")} value={String(snapshot.executionAdmin.failed)} />
            </>
          ) : (
            <EmptyState loading={isLoading} />
          )}
        </DashboardCard>

        <DashboardCard className="space-y-4 p-5">
          <SectionTitle icon={ClipboardList} title={t("aiEmployees.administration.tokens.title")} />
          {snapshot ? (
            <>
              <DetailRow label={t("aiEmployees.administration.tokens.prompt")} value={String(snapshot.tokenAdmin.promptTokens)} />
              <DetailRow label={t("aiEmployees.administration.tokens.completion")} value={String(snapshot.tokenAdmin.completionTokens)} />
              <DetailRow label={t("aiEmployees.administration.tokens.total")} value={String(snapshot.tokenAdmin.totalTokens)} />
            </>
          ) : (
            <EmptyState loading={isLoading} />
          )}
        </DashboardCard>

        <DashboardCard className="space-y-4 p-5">
          <SectionTitle icon={Activity} title={t("aiEmployees.administration.capacity.title")} />
          {snapshot ? (
            <>
              <DetailRow label={t("aiEmployees.administration.capacity.utilization")} value={`${snapshot.capacityAdmin.utilizationPercent}%`} />
              <DetailRow label={t("aiEmployees.administration.capacity.workers")} value={String(snapshot.capacityAdmin.activeWorkers)} />
              <DetailRow label={t("aiEmployees.administration.capacity.licenses")} value={`${snapshot.capacityAdmin.usedSeats}/${snapshot.capacityAdmin.licenseSeats}`} />
            </>
          ) : (
            <EmptyState loading={isLoading} />
          )}
        </DashboardCard>

        <DashboardCard className="space-y-4 p-5 xl:col-span-2">
          <SectionTitle icon={AlertTriangle} title={t("aiEmployees.administration.health.title")} />
          {snapshot ? (
            <>
              <div className="flex items-center gap-2">
                <Badge variant={snapshot.healthDashboard.overallHealth === "healthy" ? "default" : "secondary"}>
                  {snapshot.healthDashboard.overallHealth}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {t("aiEmployees.administration.health.score", { score: snapshot.healthDashboard.healthScore })}
                </span>
              </div>
              {snapshot.healthDashboard.alerts.length > 0 ? (
                <ul className="space-y-2">
                  {snapshot.healthDashboard.alerts.map((alert) => (
                    <li key={alert.id} className="rounded-xl border border-border/60 px-3 py-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span>{alert.label}</span>
                        <Badge variant="outline">{alert.severity}</Badge>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
              {snapshot.healthDashboard.recommendations.length > 0 ? (
                <BulletList title={t("aiEmployees.administration.health.recommendations")} items={snapshot.healthDashboard.recommendations} />
              ) : null}
            </>
          ) : (
            <EmptyState loading={isLoading} />
          )}
        </DashboardCard>
      </div>
    </section>
  );
});

function SectionTitle({ icon: Icon, title }: { icon: typeof Users; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="size-4 text-muted-foreground" />
      <h3 className="text-sm font-semibold">{title}</h3>
    </div>
  );
}

function EmptyState({ loading, message }: { loading?: boolean; message?: string }) {
  const { t } = useTranslation("common");
  return (
    <p className="text-sm text-muted-foreground">
      {loading ? t("aiEmployees.administration.loading") : message ?? t("aiEmployees.administration.empty")}
    </p>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/40 py-2 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

function BulletList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item} className="text-sm text-muted-foreground">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatCurrency(value: number, currency: string): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
}
