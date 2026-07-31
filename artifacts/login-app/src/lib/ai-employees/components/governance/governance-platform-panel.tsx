import { memo } from "react";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  FileText,
  Scale,
  Shield,
  Wrench,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { DashboardCard, DashboardStatCard } from "@/components/dashboard/ui";
import { Badge } from "@/components/ui/badge";
import type { AiGovernancePlatformSnapshot, AiEmployeeRecord } from "@/lib/ai-employees/types";

type GovernancePlatformPanelProps = {
  employee: AiEmployeeRecord;
  snapshot: AiGovernancePlatformSnapshot | null;
  isLoading: boolean;
};

export const GovernancePlatformPanel = memo(function GovernancePlatformPanel({
  snapshot,
  isLoading,
}: GovernancePlatformPanelProps) {
  const { t } = useTranslation("common");

  return (
    <section className="space-y-4">
      <DashboardCard className="space-y-4 p-5">
        <div>
          <h2 className="text-lg font-semibold">{t("aiEmployees.governance.title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("aiEmployees.governance.subtitle")}</p>
        </div>
      </DashboardCard>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <DashboardStatCard
          label={t("aiEmployees.governance.stats.policies")}
          value={snapshot?.dashboard.policyCount ?? "—"}
          icon={ClipboardList}
        />
        <DashboardStatCard
          label={t("aiEmployees.governance.stats.violations")}
          value={snapshot?.dashboard.violationCount ?? "—"}
          icon={AlertTriangle}
        />
        <DashboardStatCard
          label={t("aiEmployees.governance.stats.compliance")}
          value={snapshot ? `${snapshot.dashboard.complianceScore}%` : "—"}
          icon={CheckCircle2}
        />
        <DashboardStatCard
          label={t("aiEmployees.governance.stats.risk")}
          value={snapshot ? `${snapshot.dashboard.riskScore}%` : "—"}
          icon={Shield}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <DashboardCard className="space-y-4 p-5">
          <SectionTitle icon={ClipboardList} title={t("aiEmployees.governance.policies.title")} />
          {snapshot && snapshot.policies.length > 0 ? (
            <ul className="space-y-3">
              {snapshot.policies.slice(0, 8).map((policy) => (
                <li key={policy.id} className="rounded-2xl border border-border/60 bg-background/60 p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{policy.displayName}</span>
                    <Badge variant="outline">{policy.status}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{policy.category}</p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState loading={isLoading} message={t("aiEmployees.governance.policies.empty")} />
          )}
        </DashboardCard>

        <DashboardCard className="space-y-4 p-5">
          <SectionTitle icon={Scale} title={t("aiEmployees.governance.model.title")} />
          {snapshot ? (
            <>
              <BulletList title={t("aiEmployees.governance.model.allowed")} items={snapshot.modelPolicy.allowedModels} />
              <BulletList title={t("aiEmployees.governance.model.blocked")} items={snapshot.modelPolicy.blockedModels} />
              <DetailRow label={t("aiEmployees.governance.model.default")} value={snapshot.modelPolicy.defaultModel ?? "—"} />
            </>
          ) : (
            <EmptyState loading={isLoading} />
          )}
        </DashboardCard>

        <DashboardCard className="space-y-4 p-5">
          <SectionTitle icon={Shield} title={t("aiEmployees.governance.provider.title")} />
          {snapshot ? (
            <>
              <BulletList title={t("aiEmployees.governance.provider.allowed")} items={snapshot.providerPolicy.allowedProviders} />
              <BulletList title={t("aiEmployees.governance.provider.blocked")} items={snapshot.providerPolicy.blockedProviders} />
            </>
          ) : (
            <EmptyState loading={isLoading} />
          )}
        </DashboardCard>

        <DashboardCard className="space-y-4 p-5">
          <SectionTitle icon={FileText} title={t("aiEmployees.governance.prompt.title")} />
          {snapshot && snapshot.promptPolicies.length > 0 ? (
            <ul className="space-y-2">
              {snapshot.promptPolicies.slice(0, 6).map((entry) => (
                <li key={entry.employeeId} className="flex items-center justify-between text-sm">
                  <span>{entry.displayName}</span>
                  <Badge variant="outline">{entry.approvalState}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState loading={isLoading} />
          )}
        </DashboardCard>

        <DashboardCard className="space-y-4 p-5">
          <SectionTitle icon={Wrench} title={t("aiEmployees.governance.tools.title")} />
          {snapshot && snapshot.toolRestrictions.length > 0 ? (
            <ul className="space-y-2">
              {snapshot.toolRestrictions.slice(0, 8).map((tool) => (
                <li key={tool.key} className="flex items-center justify-between text-sm">
                  <span>{tool.displayName}</span>
                  <Badge variant={tool.status === "blocked" ? "destructive" : "outline"}>{tool.status}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState loading={isLoading} />
          )}
        </DashboardCard>

        <DashboardCard className="space-y-4 p-5">
          <SectionTitle icon={BookOpen} title={t("aiEmployees.governance.skills.title")} />
          {snapshot && snapshot.skillPolicies.length > 0 ? (
            <ul className="space-y-2">
              {snapshot.skillPolicies.slice(0, 6).map((skill) => (
                <li key={skill.skillId} className="flex items-center justify-between text-sm">
                  <span>{skill.displayName}</span>
                  <Badge variant="outline">{skill.status}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState loading={isLoading} />
          )}
        </DashboardCard>

        <DashboardCard className="space-y-4 p-5">
          <SectionTitle icon={AlertTriangle} title={t("aiEmployees.governance.risk.title")} />
          {snapshot ? (
            <>
              <DetailRow label={t("aiEmployees.governance.risk.level")} value={snapshot.riskAssessment.level} />
              <DetailRow label={t("aiEmployees.governance.risk.score")} value={`${snapshot.riskAssessment.score}%`} />
              <ul className="space-y--2">
                {snapshot.riskAssessment.factors.map((factor) => (
                  <li key={factor.id} className="rounded-xl border border-border/60 px-3 py-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span>{factor.label}</span>
                      <Badge variant="outline">{factor.level}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{factor.detail}</p>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <EmptyState loading={isLoading} />
          )}
        </DashboardCard>

        <DashboardCard className="space-y-4 p-5">
          <SectionTitle icon={CheckCircle2} title={t("aiEmployees.governance.compliance.title")} />
          {snapshot ? (
            <>
              <DetailRow label="GDPR" value={snapshot.compliance.gdprEnabled ? t("aiEmployees.config.enabled") : t("aiEmployees.config.disabled")} />
              <DetailRow label={t("aiEmployees.governance.compliance.audit")} value={snapshot.compliance.auditStatus} />
              <DetailRow label={t("aiEmployees.governance.compliance.retention")} value={`${snapshot.compliance.retentionDays} days`} />
              <BulletList title={t("aiEmployees.governance.compliance.privacy")} items={snapshot.compliance.privacyRules} />
            </>
          ) : (
            <EmptyState loading={isLoading} />
          )}
        </DashboardCard>

        <DashboardCard className="space-y-4 p-5">
          <SectionTitle icon={ClipboardList} title={t("aiEmployees.governance.approvals.title")} />
          {snapshot && snapshot.approvals.length > 0 ? (
            <ul className="space-y-2">
              {snapshot.approvals.slice(0, 6).map((approval) => (
                <li key={approval.id} className="flex items-center justify-between text-sm">
                  <span>{approval.entityLabel}</span>
                  <Badge variant="outline">{approval.status}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState loading={isLoading} message={t("aiEmployees.governance.approvals.empty")} />
          )}
        </DashboardCard>

        <DashboardCard className="space-y-4 p-5 xl:col-span-2">
          <SectionTitle icon={Shield} title={t("aiEmployees.governance.audit.title")} />
          {snapshot && snapshot.auditTrail.length > 0 ? (
            <ul className="space-y-2">
              {snapshot.auditTrail.slice(0, 10).map((entry) => (
                <li key={entry.id} className="flex items-center justify-between rounded-xl border border-border/60 px-3 py-2 text-sm">
                  <span>{entry.eventType.replace(/_/g, " ")}</span>
                  <span className="text-xs text-muted-foreground">{entry.createdAt}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState loading={isLoading} message={t("aiEmployees.governance.audit.empty")} />
          )}
        </DashboardCard>
      </div>
    </section>
  );
});

function SectionTitle({ icon: Icon, title }: { icon: typeof Shield; title: string }) {
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
      {loading ? t("aiEmployees.governance.loading") : message ?? t("aiEmployees.governance.empty")}
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
  if (items.length === 0) return null;
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
