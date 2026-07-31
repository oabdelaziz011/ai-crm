import { memo, useState } from "react";
import {
  BookOpen,
  CheckCircle2,
  Layers,
  Package,
  Search,
  Sparkles,
  Star,
  Wrench,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { DashboardCard, DashboardStatCard } from "@/components/dashboard/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AiEmployeeRecord, AiSkillPlatformSnapshot } from "@/lib/ai-employees/types";
import type { useAiEmployeeSkillsMarketplace } from "@/lib/ai-employees/hooks/use-ai-employee-skills";

type SkillsPlatformPanelProps = {
  employee: AiEmployeeRecord;
  snapshot: AiSkillPlatformSnapshot | null;
  isLoading: boolean;
  marketplace: ReturnType<typeof useAiEmployeeSkillsMarketplace>;
  canEdit: boolean;
  isAssigning: boolean;
  onAssign: (skillIds: string[]) => Promise<void>;
  onToggleFavorite: (skillId: string, favorite: boolean) => Promise<void>;
  onTestSkill: (skillId: string) => Promise<void>;
};

export const SkillsPlatformPanel = memo(function SkillsPlatformPanel({
  employee,
  snapshot,
  isLoading,
  marketplace,
  canEdit,
  isAssigning,
  onAssign,
  onToggleFavorite,
  onTestSkill,
}: SkillsPlatformPanelProps) {
  const { t } = useTranslation("common");
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>(employee.allowedSkillIds);

  const toggleSkillSelection = (skillId: string) => {
    setSelectedSkillIds((current) =>
      current.includes(skillId) ? current.filter((id) => id !== skillId) : [...current, skillId],
    );
  };

  return (
    <section className="space-y-4">
      <DashboardCard className="space-y-4 p-5">
        <div>
          <h2 className="text-lg font-semibold">{t("aiEmployees.skills.title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("aiEmployees.skills.subtitle")}</p>
        </div>
      </DashboardCard>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <DashboardStatCard
          label={t("aiEmployees.skills.stats.assigned")}
          value={snapshot?.assignedSkills.length ?? "—"}
          icon={Sparkles}
        />
        <DashboardStatCard
          label={t("aiEmployees.skills.stats.readiness")}
          value={snapshot ? `${snapshot.readiness.score}%` : "—"}
          icon={CheckCircle2}
        />
        <DashboardStatCard
          label={t("aiEmployees.skills.stats.tools")}
          value={snapshot?.effectiveToolKeys.length ?? "—"}
          icon={Wrench}
        />
        <DashboardStatCard
          label={t("aiEmployees.skills.stats.successRate")}
          value={snapshot ? `${snapshot.analytics.successRate}%` : "—"}
          icon={Layers}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <DashboardCard className="space-y-4 p-5">
          <SectionTitle icon={Sparkles} title={t("aiEmployees.skills.assigned.title")} />
          {snapshot && snapshot.assignedSkills.length > 0 ? (
            <ul className="space-y-3">
              {snapshot.assignedSkills.map((skill) => (
                <li key={skill.id} className="rounded-2xl border border-border/60 bg-background/60 p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{skill.displayName}</span>
                    <Badge variant="outline">{skill.status}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{skill.category}</p>
                  <p className="mt-2 line-clamp-2 text-muted-foreground">{skill.description || "—"}</p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState loading={isLoading} message={t("aiEmployees.skills.assigned.empty")} />
          )}
          {canEdit ? (
            <Button
              className="rounded-xl"
              disabled={isAssigning}
              onClick={() => void onAssign(selectedSkillIds)}
            >
              {t("aiEmployees.skills.assigned.save")}
            </Button>
          ) : null}
        </DashboardCard>

        <DashboardCard className="space-y-4 p-5">
          <SectionTitle icon={BookOpen} title={t("aiEmployees.skills.documentation.title")} />
          {snapshot?.documentation ? (
            <>
              <p className="text-sm text-muted-foreground">{snapshot.documentation.overview}</p>
              <KeyValueList
                title={t("aiEmployees.skills.documentation.tools")}
                items={snapshot.documentation.requiredTools.map((tool) => ({ label: tool, value: "required" }))}
              />
              <KeyValueList
                title={t("aiEmployees.skills.documentation.permissions")}
                items={snapshot.documentation.requiredPermissions.map((permission) => ({
                  label: permission,
                  value: "required",
                }))}
              />
              <p className="text-xs text-muted-foreground">
                {t("aiEmployees.skills.documentation.version")}: {snapshot.documentation.versionLabel}
              </p>
            </>
          ) : (
            <EmptyState loading={isLoading} message={t("aiEmployees.skills.documentation.empty")} />
          )}
        </DashboardCard>

        <DashboardCard className="space-y-4 p-5 xl:col-span-2">
          <SectionTitle icon={Package} title={t("aiEmployees.skills.marketplace.title")} />
          <div className="flex flex-wrap gap--2">
            <div className="relative min-w-[220px] flex-1">
              <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="rounded-xl ps-9"
                placeholder={t("aiEmployees.skills.marketplace.searchPlaceholder")}
                value={marketplace.filters.search ?? ""}
                onChange={(event) =>
                  marketplace.setFilters((current) => ({ ...current, search: event.target.value }))
                }
              />
            </div>
            <select
              className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
              value={marketplace.filters.category ?? "all"}
              onChange={(event) =>
                marketplace.setFilters((current) => ({ ...current, category: event.target.value }))
              }
            >
              <option value="all">{t("aiEmployees.filters.all")}</option>
              {(snapshot?.categories ?? []).map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={marketplace.filters.favoritesOnly ?? false}
                onChange={(event) =>
                  marketplace.setFilters((current) => ({ ...current, favoritesOnly: event.target.checked }))
                }
              />
              {t("aiEmployees.skills.marketplace.favoritesOnly")}
            </label>
          </div>
          {marketplace.filteredMarketplace.length > 0 ? (
            <ul className="grid gap-3 md:grid-cols-2">
              {marketplace.filteredMarketplace.slice(0, 8).map((entry) => {
                const selected = selectedSkillIds.includes(entry.id);
                return (
                  <li key={entry.id} className="rounded-2xl border border-border/60 bg-background/60 p-3 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{entry.displayName}</span>
                          {entry.isFavorite ? <Star className="size-4 fill-current text-amber-500" /> : null}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{entry.category}</p>
                      </div>
                      <Badge variant="outline">{entry.readiness.score}%</Badge>
                    </div>
                    <p className="mt-2 line-clamp-2 text-muted-foreground">{entry.description || "—"}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {canEdit ? (
                        <Button
                          size="sm"
                          variant={selected ? "default" : "outline"}
                          className="rounded-xl"
                          onClick={() => toggleSkillSelection(entry.id)}
                        >
                          {selected
                            ? t("aiEmployees.skills.marketplace.selected")
                            : t("aiEmployees.skills.marketplace.select")}
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="rounded-xl"
                        onClick={() => void onToggleFavorite(entry.id, !entry.isFavorite)}
                      >
                        {entry.isFavorite
                          ? t("aiEmployees.skills.marketplace.unfavorite")
                          : t("aiEmployees.skills.marketplace.favorite")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="rounded-xl"
                        onClick={() => void onTestSkill(entry.id)}
                      >
                        {t("aiEmployees.skills.marketplace.test")}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState loading={isLoading} message={t("aiEmployees.skills.marketplace.empty")} />
          )}
        </DashboardCard>

        <DashboardCard className="space-y-4 p-5">
          <SectionTitle icon={CheckCircle2} title={t("aiEmployees.skills.readiness.title")} />
          {snapshot ? (
            <ul className="space-y-2">
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

        <DashboardCard className="space-y-4 p-5">
          <SectionTitle icon={Layers} title={t("aiEmployees.skills.analytics.title")} />
          {snapshot ? (
            <>
              <DetailRow label={t("aiEmployees.skills.analytics.assignments")} value={String(snapshot.analytics.assignmentCount)} />
              <DetailRow label={t("aiEmployees.skills.analytics.usage")} value={String(snapshot.analytics.usageCount)} />
              <DetailRow label={t("aiEmployees.skills.analytics.failures")} value={String(snapshot.analytics.failureCount)} />
              <DetailRow
                label={t("aiEmployees.skills.analytics.avgTime")}
                value={`${snapshot.analytics.averageExecutionTimeMs}ms`}
              />
            </>
          ) : (
            <EmptyState loading={isLoading} />
          )}
        </DashboardCard>
      </div>
    </section>
  );
});

function SectionTitle({ icon: Icon, title }: { icon: typeof Sparkles; title: string }) {
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
      {loading ? t("aiEmployees.skills.loading") : message ?? t("aiEmployees.skills.empty")}
    </p>
  );
}

function KeyValueList({ title, items }: { title: string; items: Array<{ label: string; value: string }> }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.label} className="flex items-center justify-between text-sm">
            <span>{item.label}</span>
            <span className="text-muted-foreground">{item.value}</span>
          </li>
        ))}
      </ul>
    </div>
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
