import { memo } from "react";
import {
  ArrowRightLeft,
  BookOpen,
  Brain,
  CheckCircle2,
  Clock3,
  Network,
  Shield,
  Users,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { DashboardCard, DashboardStatCard } from "@/components/dashboard/ui";
import { Badge } from "@/components/ui/badge";
import type { AiEmployeeCollaborationSnapshot, AiEmployeeRecord } from "@/lib/ai-employees/types";

type CollaborationPlatformPanelProps = {
  employee: AiEmployeeRecord;
  snapshot: AiEmployeeCollaborationSnapshot | null;
  isLoading: boolean;
};

export const CollaborationPlatformPanel = memo(function CollaborationPlatformPanel({
  snapshot,
  isLoading,
}: CollaborationPlatformPanelProps) {
  const { t } = useTranslation("common");

  return (
    <section className="space-y-4">
      <DashboardCard className="space-y-4 p-5">
        <div>
          <h2 className="text-lg font-semibold">{t("aiEmployees.collaboration.title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("aiEmployees.collaboration.subtitle")}</p>
        </div>
      </DashboardCard>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <DashboardStatCard
          label={t("aiEmployees.collaboration.stats.agents")}
          value={snapshot?.directory.length ?? "—"}
          icon={Users}
        />
        <DashboardStatCard
          label={t("aiEmployees.collaboration.stats.handovers")}
          value={snapshot?.analytics.collaborationCount ?? "—"}
          icon={ArrowRightLeft}
        />
        <DashboardStatCard
          label={t("aiEmployees.collaboration.stats.successRate")}
          value={snapshot ? `${snapshot.analytics.handoverSuccessRate}%` : "—"}
          icon={CheckCircle2}
        />
        <DashboardStatCard
          label={t("aiEmployees.collaboration.stats.readiness")}
          value={snapshot ? `${snapshot.readiness.score}%` : "—"}
          icon={Network}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <DashboardCard className="space-y-4 p-5">
          <SectionTitle icon={Users} title={t("aiEmployees.collaboration.directory.title")} />
          {snapshot && snapshot.directory.length > 0 ? (
            <ul className="space-y-3">
              {snapshot.directory.slice(0, 8).map((entry) => (
                <li key={entry.employee.id} className="rounded-2xl border border-border/60 bg-background/60 p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{entry.employee.displayName}</span>
                    <Badge variant="outline">{entry.status}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {entry.department ?? "—"} · {entry.skillsSummary}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("aiEmployees.collaboration.directory.health")}: {entry.healthScore}%
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState loading={isLoading} message={t("aiEmployees.collaboration.directory.empty")} />
          )}
        </DashboardCard>

        <DashboardCard className="space-y-4 p-5">
          <SectionTitle icon={Network} title={t("aiEmployees.collaboration.groups.title")} />
          {snapshot && snapshot.groups.length > 0 ? (
            <ul className="space-y-3">
              {snapshot.groups.map((group) => (
                <li key={group.id} className="rounded-2xl border border-border/60 bg-background/60 p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{group.displayName}</span>
                    <Badge variant="outline">{group.memberCount}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{group.department ?? group.description}</p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState loading={isLoading} />
          )}
        </DashboardCard>

        <DashboardCard className="space-y-4 p-5">
          <SectionTitle icon={ArrowRightLeft} title={t("aiEmployees.collaboration.handovers.title")} />
          {snapshot && snapshot.handovers.length > 0 ? (
            <ul className="space-y-3">
              {snapshot.handovers.slice(0, 8).map((handover) => (
                <li key={handover.id} className="rounded-2xl border border-border/60 bg-background/60 p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">
                      {handover.sourceDisplayName} → {handover.destinationDisplayName}
                    </span>
                    <Badge variant="outline">{handover.status}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{handover.reason || "—"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    <Clock3 className="me-1 inline size-3" />
                    {handover.createdAt}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState loading={isLoading} message={t("aiEmployees.collaboration.handovers.empty")} />
          )}
        </DashboardCard>

        <DashboardCard className="space-y-4 p-5">
          <SectionTitle icon={BookOpen} title={t("aiEmployees.collaboration.sharedContext.title")} />
          {snapshot && snapshot.sharedContext.length > 0 ? (
            <ul className="space-y-2">
              {snapshot.sharedContext.slice(0, 8).map((entry) => (
                <li key={`${entry.key}-${entry.scope}`} className="flex items-center justify-between text-sm">
                  <span>{entry.key}</span>
                  <Badge variant="secondary">{entry.scope}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState loading={isLoading} message={t("aiEmployees.collaboration.sharedContext.empty")} />
          )}
        </DashboardCard>

        <DashboardCard className="space-y-4 p-5">
          <SectionTitle icon={Brain} title={t("aiEmployees.collaboration.sharedMemory.title")} />
          {snapshot && snapshot.sharedMemory.length > 0 ? (
            <ul className="space-y-3">
              {snapshot.sharedMemory.slice(0, 6).map((entry) => (
                <li key={entry.id} className="rounded-2xl border border-border/60 bg-background/60 p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{entry.label}</span>
                    <Badge variant="outline">{entry.scope}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {entry.ownerDisplayName} · {entry.permissions.join(", ")}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState loading={isLoading} message={t("aiEmployees.collaboration.sharedMemory.empty")} />
          )}
        </DashboardCard>

        <DashboardCard className="space-y-4 p-5">
          <SectionTitle icon={Shield} title={t("aiEmployees.collaboration.escalations.title")} />
          {snapshot && snapshot.escalations.length > 0 ? (
            <ul className="space-y-3">
              {snapshot.escalations.slice(0, 6).map((entry) => (
                <li key={entry.id} className="rounded-2xl border border-border/60 bg-background/60 p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">
                      {entry.sourceLabel} → {entry.destinationLabel}
                    </span>
                    <Badge variant="outline">{entry.type}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{entry.status}</p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState loading={isLoading} message={t("aiEmployees.collaboration.escalations.empty")} />
          )}
        </DashboardCard>

        <DashboardCard className="space-y-4 p-5 xl:col-span-2">
          <SectionTitle icon={Clock3} title={t("aiEmployees.collaboration.timeline.title")} />
          {snapshot && snapshot.timeline.length > 0 ? (
            <ul className="space-y-2">
              {snapshot.timeline.slice(0, 12).map((entry) => (
                <li key={entry.id} className="flex items-center justify-between rounded-xl border border-border/60 px-3 py-2 text-sm">
                  <span>{entry.label}</span>
                  <span className="text-xs text-muted-foreground">{entry.timestamp}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState loading={isLoading} message={t("aiEmployees.collaboration.timeline.empty")} />
          )}
        </DashboardCard>

        <DashboardCard className="space-y-4 p-5">
          <SectionTitle icon={CheckCircle2} title={t("aiEmployees.collaboration.analytics.title")} />
          {snapshot ? (
            <>
              <DetailRow label={t("aiEmployees.collaboration.analytics.collaborations")} value={String(snapshot.analytics.collaborationCount)} />
              <DetailRow label={t("aiEmployees.collaboration.analytics.avgCompletion")} value={`${snapshot.analytics.averageCompletionMs}ms`} />
              <DetailRow label={t("aiEmployees.collaboration.analytics.avgResponse")} value={`${snapshot.analytics.averageResponseMs}ms`} />
              <DetailRow label={t("aiEmployees.collaboration.analytics.failed")} value={String(snapshot.analytics.failedTransfers)} />
            </>
          ) : (
            <EmptyState loading={isLoading} />
          )}
        </DashboardCard>

        <DashboardCard className="space-y-4 p-5">
          <SectionTitle icon={Shield} title={t("aiEmployees.collaboration.policies.title")} />
          {snapshot ? (
            <>
              <BulletList title={t("aiEmployees.collaboration.policies.allowed")} items={snapshot.policies.allowedCollaborations} />
              <BulletList title={t("aiEmployees.collaboration.policies.blocked")} items={snapshot.policies.blockedCollaborations} />
            </>
          ) : (
            <EmptyState loading={isLoading} />
          )}
        </DashboardCard>

        <DashboardCard className="space-y-4 p-5 xl:col-span-2">
          <SectionTitle icon={CheckCircle2} title={t("aiEmployees.collaboration.readiness.title")} />
          {snapshot ? (
            <ul className="grid gap-2 md:grid-cols-2">
              {snapshot.readiness.categories.map((category) => (
                <li key={category.id} className="flex items-center justify-between rounded-xl border border-border/60 px-3 py-2 text-sm">
                  <span>{category.label}</span>
                  <Badge variant={category.ready ? "default" : "secondary"}>
                    {category.ready ? t("aiEmployees.config.ready") : t("aiEmployees.config.notReady")}
                  </Badge>
                </li>
              ))}
            </ul>
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
      {loading ? t("aiEmployees.collaboration.loading") : message ?? t("aiEmployees.collaboration.empty")}
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
