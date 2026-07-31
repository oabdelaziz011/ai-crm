import { memo, useState } from "react";
import {
  Activity,
  BookOpen,
  Brain,
  Bug,
  Clock3,
  Database,
  FileSearch,
  Layers,
  Settings2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { DashboardCard, DashboardStatCard } from "@/components/dashboard/ui";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { AiEmployeeMemorySnapshot, AiEmployeeRecord } from "@/lib/ai-employees/types";
import type { useAiEmployeeMemorySearch } from "@/lib/ai-employees/hooks/use-ai-employee-memory";

type MemoryCenterPanelProps = {
  employee: AiEmployeeRecord;
  snapshot: AiEmployeeMemorySnapshot | null;
  isLoading: boolean;
  search: ReturnType<typeof useAiEmployeeMemorySearch>;
};

export const MemoryCenterPanel = memo(function MemoryCenterPanel({
  snapshot,
  isLoading,
  search,
}: MemoryCenterPanelProps) {
  const { t } = useTranslation("common");
  const [showDebugger, setShowDebugger] = useState(false);

  return (
    <section className="space-y-4">
      <DashboardCard className="space-y-4 p-5">
        <div>
          <h2 className="text-lg font-semibold">{t("aiEmployees.memory.title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("aiEmployees.memory.subtitle")}</p>
        </div>
      </DashboardCard>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <DashboardStatCard
          label={t("aiEmployees.memory.overview.contextSize")}
          value={snapshot ? `${snapshot.overview.contextSizeTokens}` : "—"}
          icon={Layers}
        />
        <DashboardStatCard
          label={t("aiEmployees.memory.overview.storedMemories")}
          value={snapshot?.overview.storedMemories ?? "—"}
          icon={Database}
        />
        <DashboardStatCard
          label={t("aiEmployees.memory.overview.memoryHealth")}
          value={
            snapshot
              ? t(`aiEmployees.memory.overview.health.${snapshot.overview.memoryHealth}`)
              : t("aiEmployees.memory.loading")
          }
          icon={Activity}
        />
        <DashboardStatCard
          label={t("aiEmployees.memory.overview.memoryUsage")}
          value={snapshot ? `${snapshot.overview.memoryUsagePercent}%` : "—"}
          icon={Brain}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <DashboardCard className="space-y-4 p-5">
          <SectionTitle icon={Brain} title={t("aiEmployees.memory.shortTerm.title")} />
          {snapshot ? (
            <>
              <p className="text-sm text-muted-foreground">
                {t("aiEmployees.memory.shortTerm.session")}: {snapshot.shortTerm.sessionId ?? "—"}
              </p>
              <KeyValueList
                title={t("aiEmployees.memory.shortTerm.variables")}
                items={snapshot.shortTerm.activeVariables.map((item) => ({ label: item.key, value: item.value }))}
              />
              <BulletList title={t("aiEmployees.memory.shortTerm.recentFacts")} items={snapshot.shortTerm.recentFacts} />
            </>
          ) : (
            <EmptyState loading={isLoading} />
          )}
        </DashboardCard>

        <DashboardCard className="space-y-4 p-5">
          <SectionTitle icon={Database} title={t("aiEmployees.memory.longTerm.title")} />
          <MemorySearchBar search={search} />
          {search.filteredEntries.length > 0 ? (
            <ul className="space-y-3">
              {search.filteredEntries.slice(0, 10).map((entry) => (
                <li key={entry.id} className="rounded-2xl border border-border/60 bg-background/60 p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{entry.label}</span>
                    <Badge variant="outline">{entry.type}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{entry.source}</p>
                  <p className="mt-2 line-clamp-3 text-muted-foreground">{entry.content}</p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState loading={isLoading} message={t("aiEmployees.memory.longTerm.empty")} />
          )}
        </DashboardCard>

        <DashboardCard className="space-y-4 p-5">
          <SectionTitle icon={Layers} title={t("aiEmployees.memory.contextWindow.title")} />
          {snapshot ? (
            <>
              <p className="text-sm text-muted-foreground">
                {t("aiEmployees.memory.contextWindow.usage", {
                  estimated: snapshot.contextWindow.estimatedTokens,
                  max: snapshot.contextWindow.maxTokens,
                })}
              </p>
              <ul className="space-y-2">
                {snapshot.contextWindow.sections.map((section) => (
                  <li key={section.key} className="flex items-center justify-between rounded-xl border border-border/50 px-3 py-2 text-sm">
                    <span>{section.label}</span>
                    <span className="text-muted-foreground">
                      {section.included ? `${section.tokenEstimate} tokens` : t("aiEmployees.memory.contextWindow.excluded")}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <EmptyState loading={isLoading} />
          )}
        </DashboardCard>

        <DashboardCard className="space-y-4 p-5">
          <SectionTitle icon={Clock3} title={t("aiEmployees.memory.timeline.title")} />
          {snapshot && snapshot.timeline.length > 0 ? (
            <ol className="space-y-3">
              {snapshot.timeline.slice(0, 10).map((entry) => (
                <li key={entry.id} className="rounded-2xl border border-border/60 bg-background/60 p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{entry.label}</span>
                    <Badge variant="outline">{t(`aiEmployees.memory.timeline.events.${entry.eventType}`)}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {entry.source} · {new Date(entry.timestamp).toLocaleString()}
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState loading={isLoading} message={t("aiEmployees.memory.timeline.empty")} />
          )}
        </DashboardCard>

        <DashboardCard className="space-y-4 p-5">
          <SectionTitle icon={FileSearch} title={t("aiEmployees.memory.inspector.title")} />
          {snapshot ? (
            <>
              <InspectorBlock title={t("aiEmployees.memory.inspector.prompt")} content={snapshot.inspector.prompt} />
              <BulletList title={t("aiEmployees.memory.inspector.memories")} items={snapshot.inspector.memories} />
              <BulletList title={t("aiEmployees.memory.inspector.knowledge")} items={snapshot.inspector.knowledgeReferences} />
              <BulletList title={t("aiEmployees.memory.inspector.tools")} items={snapshot.inspector.toolContext} />
            </>
          ) : (
            <EmptyState loading={isLoading} />
          )}
        </DashboardCard>

        <DashboardCard className="space-y-4 p-5">
          <SectionTitle icon={Settings2} title={t("aiEmployees.memory.policies.title")} />
          {snapshot ? (
            <KeyValueList
              items={[
                { label: t("aiEmployees.memory.policies.memoryMode"), value: snapshot.policies.memoryMode },
                { label: t("aiEmployees.memory.policies.retention"), value: snapshot.policies.retentionPolicy },
                { label: t("aiEmployees.memory.policies.expiration"), value: snapshot.policies.expirationPolicy },
                { label: t("aiEmployees.memory.policies.maxContext"), value: String(snapshot.policies.maxContextSize) },
              ]}
            />
          ) : (
            <EmptyState loading={isLoading} />
          )}
          {snapshot ? (
            <BulletList title={t("aiEmployees.memory.policies.privacy")} items={snapshot.policies.privacyRules} />
          ) : null}
        </DashboardCard>

        <DashboardCard className="space-y-4 p-5">
          <SectionTitle icon={BookOpen} title={t("aiEmployees.memory.analytics.title")} />
          {snapshot ? (
            <KeyValueList
              items={[
                { label: t("aiEmployees.memory.analytics.hits"), value: String(snapshot.analytics.memoryHits) },
                { label: t("aiEmployees.memory.analytics.misses"), value: String(snapshot.analytics.memoryMisses) },
                { label: t("aiEmployees.memory.analytics.retrievalSuccess"), value: `${snapshot.analytics.retrievalSuccessRate}%` },
                {
                  label: t("aiEmployees.memory.analytics.averageRetrievalTime"),
                  value: snapshot.analytics.averageRetrievalTimeMs != null ? `${snapshot.analytics.averageRetrievalTimeMs}ms` : "—",
                },
                { label: t("aiEmployees.memory.analytics.contextGrowth"), value: `${snapshot.analytics.contextGrowthPercent}%` },
              ]}
            />
          ) : (
            <EmptyState loading={isLoading} />
          )}
        </DashboardCard>

        <DashboardCard className="space-y-4 p-5 xl:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <SectionTitle icon={Bug} title={t("aiEmployees.memory.debugger.title")} />
            <button
              type="button"
              className="text-sm text-primary underline-offset-4 hover:underline"
              onClick={() => setShowDebugger((value) => !value)}
            >
              {showDebugger ? t("aiEmployees.memory.debugger.hide") : t("aiEmployees.memory.debugger.show")}
            </button>
          </div>
          {snapshot && showDebugger ? (
            <>
              <p className="text-sm text-muted-foreground">
                {t("aiEmployees.memory.debugger.finalSize", { tokens: snapshot.debugger.finalContextSizeTokens })}
              </p>
              <ol className="space-y-2">
                {snapshot.debugger.assemblyOrder.map((step) => (
                  <li key={step.order} className="rounded-xl border border-border/50 px-3 py-2 text-sm">
                    {step.order}. {step.label} — {step.tokenEstimate} tokens ({step.source})
                  </li>
                ))}
              </ol>
              <BulletList title={t("aiEmployees.memory.debugger.memorySources")} items={snapshot.debugger.memorySources} />
              <BulletList title={t("aiEmployees.memory.debugger.knowledgeSources")} items={snapshot.debugger.knowledgeSources} />
            </>
          ) : (
            <EmptyState loading={isLoading} message={t("aiEmployees.memory.debugger.collapsed")} />
          )}
        </DashboardCard>
      </div>
    </section>
  );
});

function SectionTitle({ icon: Icon, title }: { icon: typeof Brain; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="size-4 text-primary" />
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
    </div>
  );
}

function MemorySearchBar({ search }: { search: ReturnType<typeof useAiEmployeeMemorySearch> }) {
  const { t } = useTranslation("common");
  return (
    <div className="grid gap-2 md:grid-cols-3">
      <Input
        value={search.filters.keyword ?? ""}
        onChange={(event) => search.setFilters((current) => ({ ...current, keyword: event.target.value }))}
        placeholder={t("aiEmployees.memory.search.keyword")}
        className="rounded-xl"
      />
      <select
        className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
        value={search.filters.type ?? "all"}
        onChange={(event) => search.setFilters((current) => ({ ...current, type: event.target.value as typeof current.type }))}
      >
        <option value="all">{t("aiEmployees.memory.search.allTypes")}</option>
        {search.types.map((type) => (
          <option key={type} value={type}>
            {type}
          </option>
        ))}
      </select>
      <select
        className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
        value={search.filters.source ?? "all"}
        onChange={(event) => search.setFilters((current) => ({ ...current, source: event.target.value }))}
      >
        <option value="all">{t("aiEmployees.memory.search.allSources")}</option>
        {search.sources.map((source) => (
          <option key={source} value={source}>
            {source}
          </option>
        ))}
      </select>
    </div>
  );
}

function KeyValueList({ title, items }: { title?: string; items: Array<{ label: string; value: string }> }) {
  return (
    <div className="space-y-2">
      {title ? <p className="text-sm font-medium">{title}</p> : null}
      <dl className="space-y-2 text-sm">
        {items.map((item) => (
          <div key={item.label} className="flex items-start justify-between gap-3 border-b border-border/40 py-2 last:border-0">
            <dt className="text-muted-foreground">{item.label}</dt>
            <dd className="max-w-[60%] text-end font-medium">{item.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function BulletList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{title}</p>
      <ul className="space-y-1 text-sm text-muted-foreground">
        {items.map((item) => (
          <li key={item}>• {item}</li>
        ))}
      </ul>
    </div>
  );
}

function InspectorBlock({ title, content }: { title: string; content: string }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{title}</p>
      <pre className="max-h-40 overflow-auto rounded-xl border border-border/50 bg-muted/30 p-3 text-xs whitespace-pre-wrap">
        {content || "—"}
      </pre>
    </div>
  );
}

function EmptyState({ loading, message }: { loading?: boolean; message?: string }) {
  const { t } = useTranslation("common");
  return <p className="text-sm text-muted-foreground">{loading ? t("aiEmployees.memory.loading") : message ?? t("aiEmployees.memory.empty")}</p>;
}
