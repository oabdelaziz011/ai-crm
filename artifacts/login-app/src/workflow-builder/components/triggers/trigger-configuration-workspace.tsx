import { memo, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Beaker,
  CheckCircle2,
  Eye,
  Search,
  Settings2,
  Variable,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DashboardCard } from "@/components/dashboard/ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { WorkflowTriggerConfigurationController } from "../../triggers/hooks/use-workflow-trigger-configuration";
import {
  getTriggerCatalogEntry,
  listTriggerCatalogEntries,
  listTriggerCategories,
  searchTriggerCatalog,
} from "../../triggers/adapters/trigger-registry-adapter";
import type { TriggerCatalogId, TriggerCategory } from "../../triggers/types/trigger-types";
import type { WorkflowSimulationController } from "../../simulation/hooks/use-workflow-simulation";

type TriggerConfigurationWorkspaceProps = {
  trigger: WorkflowTriggerConfigurationController;
  simulation: WorkflowSimulationController | null;
};

export const TriggerConfigurationWorkspace = memo(function TriggerConfigurationWorkspace({
  trigger,
  simulation,
}: TriggerConfigurationWorkspaceProps) {
  const { t } = useTranslation("common");
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<TriggerCategory | "all">("all");

  const catalogEntries = useMemo(() => {
    const searched = searchTriggerCatalog(search);
    if (activeCategory === "all") return searched;
    return searched.filter((entry) => entry.category === activeCategory);
  }, [activeCategory, search]);

  const selectedEntry = listTriggerCatalogEntries().find((entry) => entry.id === trigger.configuration.catalogId);

  return (
    <div className="flex flex-col gap-4">
      <DashboardCard className="gap-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">{t("workflowBuilder.triggers.title")}</h3>
            <p className="text-xs text-muted-foreground">{t("workflowBuilder.triggers.subtitle")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{t("workflowBuilder.triggers.readiness.score", { score: trigger.readiness.score })}</Badge>
            <Badge variant={selectedEntry?.classification === "executable" ? "default" : "secondary"}>
              {selectedEntry?.classification === "executable"
                ? t("workflowBuilder.triggers.badges.executable")
                : t("workflowBuilder.triggers.badges.configurationOnly")}
            </Badge>
          </div>
        </div>

        <div className="grid gap-2">
          {trigger.readiness.factors.map((factor) => (
            <div key={factor.id} className="flex items-center gap-2 text-xs">
              {factor.satisfied ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
              )}
              <span>{t(factor.labelKey)}</span>
            </div>
          ))}
        </div>
      </DashboardCard>

      <DashboardCard className="gap-3 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Search className="h-4 w-4" />
          {t("workflowBuilder.triggers.catalog.title")}
        </div>
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("workflowBuilder.triggers.catalog.searchPlaceholder")}
          disabled={!trigger.canEdit}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={activeCategory === "all" ? "default" : "outline"}
            className="rounded-xl"
            onClick={() => setActiveCategory("all")}
          >
            {t("workflowBuilder.triggers.catalog.allCategories")}
          </Button>
          {listTriggerCategories().map((category) => (
            <Button
              key={category}
              type="button"
              size="sm"
              variant={activeCategory === category ? "default" : "outline"}
              className="rounded-xl"
              onClick={() => setActiveCategory(category)}
            >
              {t(`workflowBuilder.triggers.categories.${category}`)}
            </Button>
          ))}
        </div>
        <div className="grid max-h-56 gap-2 overflow-y-auto">
          {catalogEntries.map((entry) => (
            <button
              key={entry.id}
              type="button"
              disabled={!trigger.canEdit}
              onClick={() => trigger.selectCatalogTrigger(entry.id as TriggerCatalogId)}
              className={`rounded-xl border px-3 py-2 text-start transition ${
                trigger.configuration.catalogId === entry.id
                  ? "border-primary bg-primary/5"
                  : "border-border/60 hover:border-primary/40"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">
                  {t(`workflowBuilder.triggers.types.${entry.labelKey}`)}
                </span>
                <Badge variant={entry.classification === "executable" ? "outline" : "secondary"}>
                  {entry.classification === "executable"
                    ? t("workflowBuilder.triggers.badges.executable")
                    : t("workflowBuilder.triggers.badges.configurationOnly")}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {t(`workflowBuilder.triggers.descriptions.${entry.descriptionKey}`)}
              </p>
              <p className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                {t(`workflowBuilder.triggers.categories.${entry.category}`)}
              </p>
            </button>
          ))}
        </div>
      </DashboardCard>

      <DashboardCard className="gap-3 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Settings2 className="h-4 w-4" />
          {t("workflowBuilder.triggers.configuration.title")}
        </div>
        <TriggerConfigurationFields trigger={trigger} />
      </DashboardCard>

      <DashboardCard className="gap-3 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Eye className="h-4 w-4" />
          {t("workflowBuilder.triggers.preview.title")}
        </div>
        <p className="text-xs text-muted-foreground">{t("workflowBuilder.triggers.preview.subtitle")}</p>
        <div className="grid gap-2 text-xs">
          <div>
            <span className="font-medium">{t("workflowBuilder.triggers.preview.source")}: </span>
            {trigger.preview.source}
          </div>
          <div>
            <span className="font-medium">{t("workflowBuilder.triggers.preview.channel")}: </span>
            {trigger.preview.channel ?? t("workflowBuilder.triggers.preview.noChannel")}
          </div>
        </div>
        <pre className="max-h-40 overflow-auto rounded-xl bg-muted/40 p-3 text-xs">
          {JSON.stringify(trigger.preview.payload, null, 2)}
        </pre>
        <pre className="max-h-32 overflow-auto rounded-xl bg-muted/20 p-3 text-xs">
          {JSON.stringify(trigger.preview.metadata, null, 2)}
        </pre>
      </DashboardCard>

      <DashboardCard className="gap-3 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Variable className="h-4 w-4" />
          {t("workflowBuilder.triggers.variables.title")}
        </div>
        <p className="text-xs text-muted-foreground">{t("workflowBuilder.triggers.variables.subtitle")}</p>
        <div className="grid max-h-40 gap-1 overflow-y-auto text-xs">
          {trigger.preview.variables.slice(0, 12).map((variable) => (
            <div key={variable.token} className="flex items-center justify-between gap-2 rounded-lg bg-muted/30 px-2 py-1">
              <code>{variable.token}</code>
              <span className="text-muted-foreground">{variable.previewValue ?? "—"}</span>
            </div>
          ))}
        </div>
      </DashboardCard>

      <DashboardCard className="gap-3 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Activity className="h-4 w-4" />
          {t("workflowBuilder.triggers.analytics.title")}
        </div>
        {trigger.analyticsLoading ? (
          <p className="text-xs text-muted-foreground">{t("workflowBuilder.triggers.analytics.loading")}</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 text-xs">
            <Metric label={t("workflowBuilder.triggers.analytics.executions")} value={trigger.analytics?.executions ?? 0} />
            <Metric label={t("workflowBuilder.triggers.analytics.failures")} value={trigger.analytics?.failures ?? 0} />
            <Metric
              label={t("workflowBuilder.triggers.analytics.latency")}
              value={
                trigger.analytics?.averageLatencyMs != null
                  ? `${trigger.analytics.averageLatencyMs}ms`
                  : t("workflowBuilder.triggers.analytics.noData")
              }
            />
            <Metric
              label={t("workflowBuilder.triggers.analytics.lastRun")}
              value={trigger.analytics?.lastRunAt ?? t("workflowBuilder.triggers.analytics.noData")}
            />
          </div>
        )}
      </DashboardCard>

      <DashboardCard className="gap-3 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Beaker className="h-4 w-4" />
          {t("workflowBuilder.triggers.testing.title")}
        </div>
        <p className="text-xs text-muted-foreground">{t("workflowBuilder.triggers.testing.subtitle")}</p>
        <Button
          type="button"
          size="sm"
          className="rounded-xl"
          disabled={!trigger.canTest || !simulation}
          onClick={async () => {
            if (!simulation) return;
            simulation.setPanelOpen(true);
            await simulation.restart({
              autoAdvance: true,
              initialVariables: trigger.testPayload.initialVariables,
            });
          }}
        >
          {t("workflowBuilder.triggers.testing.runMock")}
        </Button>
      </DashboardCard>

      {trigger.validationIssues.length > 0 ? (
        <DashboardCard className="gap-2 p-4">
          <p className="text-sm font-semibold">{t("workflowBuilder.triggers.validation.title")}</p>
          {trigger.validationIssues.map((issue) => (
            <div key={issue.id} className="flex items-start gap-2 text-xs">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
              <span>{issue.message}</span>
            </div>
          ))}
        </DashboardCard>
      ) : null}
    </div>
  );
});

function TriggerConfigurationFields({ trigger }: { trigger: WorkflowTriggerConfigurationController }) {
  const { t } = useTranslation("common");
  const config = trigger.configuration;
  const catalogId = config.catalogId;

  return (
    <div className="grid gap-3">
      {catalogId === "schedule" ? (
        <>
          <Field
            label={t("workflowBuilder.triggers.fields.cronExpression")}
            value={config.cronExpression ?? ""}
            disabled={!trigger.canEdit}
            onChange={(value) => trigger.updateTriggerConfig({ cronExpression: value })}
          />
          <Field
            label={t("workflowBuilder.triggers.fields.timezone")}
            value={config.timezone ?? "UTC"}
            disabled={!trigger.canEdit}
            onChange={(value) => trigger.updateTriggerConfig({ timezone: value })}
          />
        </>
      ) : null}

      {catalogId === "webhook" ? (
        <Field
          label={t("workflowBuilder.triggers.fields.webhookPath")}
          value={config.webhookPath ?? ""}
          disabled={!trigger.canEdit}
          onChange={(value) => trigger.updateTriggerConfig({ webhookPath: value })}
        />
      ) : null}

      {catalogId === "rest_api" ? (
        <Field
          label={t("workflowBuilder.triggers.fields.apiAuthHint")}
          value={config.apiAuthHint ?? ""}
          disabled={!trigger.canEdit}
          onChange={(value) => trigger.updateTriggerConfig({ apiAuthHint: value })}
        />
      ) : null}

      {catalogId === "custom_event" ? (
        <Field
          label={t("workflowBuilder.triggers.fields.customEventName")}
          value={config.customEventName ?? ""}
          disabled={!trigger.canEdit}
          onChange={(value) => trigger.updateTriggerConfig({ customEventName: value })}
        />
      ) : null}

      {config.businessEvent ? (
        <div className="rounded-xl bg-muted/30 px-3 py-2 text-xs">
          <span className="font-medium">{t("workflowBuilder.triggers.fields.businessEvent")}: </span>
          {config.businessEvent}
        </div>
      ) : null}
    </div>
  );
}

function Field({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-1">
      <Label className="text-xs">{label}</Label>
      <Textarea
        value={value}
        disabled={disabled}
        rows={2}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-xl"
      />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border/60 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}
