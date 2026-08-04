import { Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import type { OperationsSavedView } from "@workspace/universal-operations-engine";
import { WorkspacePanel } from "@/components/customer-workspace/workspace-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { newId } from "./config-editor-shared";
import {
  CalendarLayoutTab,
  Customer360LayoutTab,
  IntelligenceLayoutTab,
  KanbanLayoutTab,
  TimelineLayoutTab,
} from "./operations-config-layout-tabs";
import type { ConfigAdvancedTabProps, ConfigTabEditorProps } from "./operations-config-tab-types";

export function AutomationConfigTab({ draft, updateDraft }: ConfigTabEditorProps) {
  const { t } = useTranslation("common");
  const automation = draft.automation ?? { linkedWorkflowTemplateIds: [], enabledTriggerKeys: [] };

  return (
    <WorkspacePanel title={t("universalOperations.configuration.tabs.automation")}>
      <p className="mb-4 text-sm text-muted-foreground">{t("universalOperations.configuration.automation.hint")}</p>
      <div className="space-y-2">
        <Label>{t("universalOperations.configuration.automation.triggers")}</Label>
        {(automation.enabledTriggerKeys ?? []).map((key, index) => (
          <div key={`${key}-${index}`} className="flex gap-2">
            <Input
              value={key}
              onChange={(e) => {
                const next = [...automation.enabledTriggerKeys];
                next[index] = e.target.value;
                updateDraft({ automation: { ...automation, enabledTriggerKeys: next } });
              }}
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="text-destructive"
              onClick={() =>
                updateDraft({
                  automation: {
                    ...automation,
                    enabledTriggerKeys: automation.enabledTriggerKeys.filter((_, i) => i !== index),
                  },
                })
              }
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() =>
            updateDraft({
              automation: { ...automation, enabledTriggerKeys: [...automation.enabledTriggerKeys, "status_changed"] },
            })
          }
        >
          <Plus className="me-1 size-3.5" />
          {t("universalOperations.configuration.add")}
        </Button>
      </div>
      <div className="mt-4">
        <Button asChild variant="outline" size="sm">
          <Link to="/dashboard/workflows">{t("universalOperations.configuration.automation.openWorkflowBuilder")}</Link>
        </Button>
      </div>
    </WorkspacePanel>
  );
}

export function PermissionsConfigTab({ draft, updateDraft }: ConfigTabEditorProps) {
  const { t } = useTranslation("common");
  const permissions = draft.permissions ?? { columns: {}, statuses: {}, actions: {} };

  const sections = [
    { key: "columns" as const, label: t("universalOperations.configuration.permissions.columns") },
    { key: "statuses" as const, label: t("universalOperations.configuration.permissions.statuses") },
    { key: "actions" as const, label: t("universalOperations.configuration.permissions.actions") },
  ];

  return (
    <WorkspacePanel title={t("universalOperations.configuration.tabs.permissions")}>
      {sections.map(({ key, label }) => (
        <div key={key} className="mb-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
          {Object.entries(permissions[key]).map(([entityId, roles]) => (
            <div key={entityId} className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-border/50 p-2">
              <Input
                value={entityId}
                className="max-w-[160px]"
                onChange={(e) => {
                  const nextId = e.target.value;
                  if (!nextId || nextId === entityId) return;
                  const entries = { ...permissions[key] };
                  entries[nextId] = entries[entityId] ?? [];
                  delete entries[entityId];
                  updateDraft({ permissions: { ...permissions, [key]: entries } });
                }}
              />
              <Input
                value={(roles ?? []).join(", ")}
                placeholder={t("universalOperations.configuration.permissions.rolesPlaceholder")}
                onChange={(e) =>
                  updateDraft({
                    permissions: {
                      ...permissions,
                      [key]: {
                        ...permissions[key],
                        [entityId]: e.target.value.split(",").map((r) => r.trim()).filter(Boolean),
                      },
                    },
                  })
                }
              />
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              const entityId = key === "columns" ? draft.columns[0]?.id ?? "col_new" : key === "statuses" ? draft.statuses[0]?.id ?? "st_new" : "check_in";
              updateDraft({
                permissions: {
                  ...permissions,
                  [key]: { ...permissions[key], [entityId]: ["manager"] },
                },
              });
            }}
          >
            <Plus className="me-1 size-3.5" />
            {t("universalOperations.configuration.add")}
          </Button>
        </div>
      ))}
    </WorkspacePanel>
  );
}

export function ViewsConfigTab({ draft, updateDraft }: ConfigTabEditorProps) {
  const { t } = useTranslation("common");
  const views = draft.views?.savedViews ?? [];

  const patchViews = (next: OperationsSavedView[]) => {
    updateDraft({ views: { ...draft.views, savedViews: next, gridPreferences: draft.views?.gridPreferences ?? { columnOrder: [], hiddenColumnIds: [], columnWidths: {}, pinnedColumns: {}, density: "comfortable" } } });
  };

  return (
    <WorkspacePanel title={t("universalOperations.configuration.tabs.views")}>
      <div className="mb-3 flex justify-end">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() =>
            patchViews([
              ...views,
              {
                id: newId("view"),
                name: "New View",
                columnIds: draft.columns.filter((c) => c.visible).map((c) => c.id),
                filters: {},
                sort: [],
                isDefault: views.length === 0,
                isShared: false,
              },
            ])
          }
        >
          <Plus className="me-1 size-3.5" />
          {t("universalOperations.configuration.add")}
        </Button>
      </div>
      <div className="space-y-2">
        {views.map((view) => (
          <div key={view.id} className="rounded-lg border border-border/50 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Input value={view.name} onChange={(e) => patchViews(views.map((v) => (v.id === view.id ? { ...v, name: e.target.value } : v)))} />
              <select
                multiple
                value={view.columnIds}
                className="min-h-[80px] rounded-md border border-input bg-background px-2 text-xs"
                onChange={(e) => {
                  const selected = Array.from(e.target.selectedOptions).map((o) => o.value);
                  patchViews(views.map((v) => (v.id === view.id ? { ...v, columnIds: selected } : v)));
                }}
              >
                {draft.columns.map((col) => (
                  <option key={col.id} value={col.id}>
                    {col.displayName}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-2 text-xs">
                <Switch checked={view.isDefault} onCheckedChange={(checked) => patchViews(views.map((v) => ({ ...v, isDefault: v.id === view.id ? checked : checked ? false : v.isDefault })))} />
                {t("universalOperations.configuration.views.default")}
              </label>
              <label className="flex items-center gap-2 text-xs">
                <Switch checked={view.isShared} onCheckedChange={(checked) => patchViews(views.map((v) => (v.id === view.id ? { ...v, isShared: checked } : v)))} />
                {t("universalOperations.configuration.views.shared")}
              </label>
              <Button type="button" size="icon" variant="ghost" className="text-destructive ms-auto" onClick={() => patchViews(views.filter((v) => v.id !== view.id))}>
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-6 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("universalOperations.configuration.views.gridPreferences")}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>{t("universalOperations.configuration.views.density")}</Label>
            <select
              value={draft.views?.gridPreferences?.density ?? "comfortable"}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
              onChange={(e) =>
                updateDraft({
                  views: {
                    savedViews: views,
                    gridPreferences: {
                      ...(draft.views?.gridPreferences ?? { columnOrder: [], hiddenColumnIds: [], columnWidths: {}, pinnedColumns: {} }),
                      density: e.target.value as "compact" | "comfortable" | "spacious",
                    },
                  },
                })
              }
            >
              <option value="compact">compact</option>
              <option value="comfortable">comfortable</option>
              <option value="spacious">spacious</option>
            </select>
          </div>
        </div>
      </div>
    </WorkspacePanel>
  );
}

export function NotificationsConfigTab({ draft, updateDraft }: ConfigTabEditorProps) {
  const { t } = useTranslation("common");
  const notifications = draft.notifications ?? {
    email: { enabled: true },
    sms: { enabled: false },
    whatsapp: { enabled: true },
    push: { enabled: false },
  };
  const channels = ["email", "sms", "whatsapp", "push"] as const;

  return (
    <WorkspacePanel title={t("universalOperations.configuration.tabs.notifications")}>
      <div className="space-y-3">
        {channels.map((channel) => (
          <div key={channel} className="flex flex-wrap items-center gap-3 rounded-lg border border-border/50 p-3">
            <span className="w-24 text-sm font-medium capitalize">{channel}</span>
            <Switch
              checked={notifications[channel]?.enabled ?? false}
              onCheckedChange={(checked) =>
                updateDraft({ notifications: { ...notifications, [channel]: { ...notifications[channel], enabled: checked } } })
              }
            />
            <Input
              value={notifications[channel]?.templateId ?? ""}
              placeholder={t("universalOperations.configuration.notifications.templateId")}
              className="max-w-xs"
              onChange={(e) =>
                updateDraft({
                  notifications: { ...notifications, [channel]: { ...notifications[channel], enabled: notifications[channel]?.enabled ?? false, templateId: e.target.value } },
                })
              }
            />
          </div>
        ))}
      </div>
    </WorkspacePanel>
  );
}

export function IntegrationsConfigTab({ draft, updateDraft }: ConfigTabEditorProps) {
  const { t } = useTranslation("common");
  const flags = draft.featureFlags?.flags ?? {};
  const rules = draft.routing?.rules ?? [];

  return (
    <div className="space-y-4">
      <WorkspacePanel title={t("universalOperations.configuration.integrations.featureFlags")}>
        {Object.entries(flags).map(([key, enabled]) => (
          <label key={key} className="mb-2 flex items-center justify-between rounded-lg border border-border/50 px-3 py-2 text-sm">
            <span>{key}</span>
            <Switch
              checked={enabled}
              onCheckedChange={(checked) =>
                updateDraft({ featureFlags: { flags: { ...flags, [key]: checked } } })
              }
            />
          </label>
        ))}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="mt-2"
          onClick={() => updateDraft({ featureFlags: { flags: { ...flags, [`flag_${Object.keys(flags).length + 1}`]: false } } })}
        >
          <Plus className="me-1 size-3.5" />
          {t("universalOperations.configuration.add")}
        </Button>
      </WorkspacePanel>
      <WorkspacePanel title={t("universalOperations.configuration.integrations.routing")}>
        {rules.map((rule) => (
          <div key={rule.id} className="mb-2 grid gap-2 rounded-lg border border-border/50 p-3 sm:grid-cols-3">
            <Input value={rule.name} onChange={(e) => updateDraft({ routing: { rules: rules.map((r) => (r.id === rule.id ? { ...r, name: e.target.value } : r)) } })} />
            <Input value={rule.condition} placeholder={t("universalOperations.configuration.integrations.condition")} onChange={(e) => updateDraft({ routing: { rules: rules.map((r) => (r.id === rule.id ? { ...r, condition: e.target.value } : r)) } })} />
            <div className="flex items-center gap-2">
              <Input value={rule.target} placeholder={t("universalOperations.configuration.integrations.target")} onChange={(e) => updateDraft({ routing: { rules: rules.map((r) => (r.id === rule.id ? { ...r, target: e.target.value } : r)) } })} />
              <Switch checked={rule.enabled} onCheckedChange={(checked) => updateDraft({ routing: { rules: rules.map((r) => (r.id === rule.id ? { ...r, enabled: checked } : r)) } })} />
              <Button type="button" size="icon" variant="ghost" className="text-destructive" onClick={() => updateDraft({ routing: { rules: rules.filter((r) => r.id !== rule.id) } })}>
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          </div>
        ))}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() =>
            updateDraft({
              routing: {
                rules: [...rules, { id: newId("route"), name: "New Rule", condition: "", target: "", enabled: true }],
              },
            })
          }
        >
          <Plus className="me-1 size-3.5" />
          {t("universalOperations.configuration.add")}
        </Button>
      </WorkspacePanel>
    </div>
  );
}

export function AiConfigTab({ draft, updateDraft }: ConfigTabEditorProps) {
  const { t } = useTranslation("common");
  const ai = draft.ai ?? { copilotEnabled: true, suggestionsEnabled: true, knowledgeSourceIds: [], allowedTools: [], safetyPolicies: {} };

  return (
    <WorkspacePanel title={t("universalOperations.configuration.tabs.ai")}>
      <div className="space-y-4">
        <label className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2">
          <span className="text-sm">{t("universalOperations.configuration.ai.copilot")}</span>
          <Switch checked={ai.copilotEnabled} onCheckedChange={(checked) => updateDraft({ ai: { ...ai, copilotEnabled: checked } })} />
        </label>
        <label className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2">
          <span className="text-sm">{t("universalOperations.configuration.ai.suggestions")}</span>
          <Switch checked={ai.suggestionsEnabled} onCheckedChange={(checked) => updateDraft({ ai: { ...ai, suggestionsEnabled: checked } })} />
        </label>
        <div className="space-y-2">
          <Label>{t("universalOperations.configuration.ai.allowedTools")}</Label>
          <Input
            value={(ai.allowedTools ?? []).join(", ")}
            placeholder="summarize, answer, risk"
            onChange={(e) => updateDraft({ ai: { ...ai, allowedTools: e.target.value.split(",").map((v) => v.trim()).filter(Boolean) } })}
          />
        </div>
        <div className="space-y-2">
          <Label>{t("universalOperations.configuration.ai.knowledgeSources")}</Label>
          <Input
            value={(ai.knowledgeSourceIds ?? []).join(", ")}
            onChange={(e) => updateDraft({ ai: { ...ai, knowledgeSourceIds: e.target.value.split(",").map((v) => v.trim()).filter(Boolean) } })}
          />
        </div>
      </div>
    </WorkspacePanel>
  );
}

export function DashboardConfigTab({ draft, updateDraft }: ConfigTabEditorProps) {
  const { t } = useTranslation("common");
  const dashboard = draft.dashboard ?? { widgets: [], kpis: [], charts: [] };

  return (
    <WorkspacePanel title={t("universalOperations.configuration.dashboard.title")}>
      <p className="mb-3 text-xs text-muted-foreground">{t("universalOperations.configuration.dashboard.hint")}</p>
      {dashboard.widgets.map((widget) => (
        <label key={widget.id} className="mb-2 flex items-center justify-between rounded-lg border border-border/50 px-3 py-2 text-sm">
          <span>{widget.labelKey}</span>
          <Switch
            checked={widget.visible}
            onCheckedChange={(checked) =>
              updateDraft({
                dashboard: {
                  ...dashboard,
                  widgets: dashboard.widgets.map((w) => (w.id === widget.id ? { ...w, visible: checked } : w)),
                },
              })
            }
          />
        </label>
      ))}
    </WorkspacePanel>
  );
}

export function AdvancedConfigTab({ draft, updateDraft, versions, onRollback, onCompareVersion }: ConfigAdvancedTabProps) {
  const { t } = useTranslation("common");
  const sla = draft.sla ?? { rules: [] };
  const queueRules = draft.queueRules ?? { defaultSort: [], defaultFilters: {}, pageSize: 50 };
  const forms = draft.forms ?? { schemas: [] };

  return (
    <div className="space-y-4">
      <DashboardConfigTab draft={draft} updateDraft={updateDraft} />
      <WorkspacePanel title={t("universalOperations.configuration.advanced.versionHistory")}>
        <div className="space-y-2">
          {versions.map((v) => (
            <div key={v.version} className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2 text-sm">
              <div>
                <span className="font-medium">v{v.version}</span>
                {v.changeSummary && <span className="ms-2 text-muted-foreground">{v.changeSummary}</span>}
              </div>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => onCompareVersion?.(v.version)}>
                  {t("universalOperations.configuration.enterprise.diff")}
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => onRollback(v.version)}>
                  {t("universalOperations.configuration.advanced.rollback")}
                </Button>
              </div>
            </div>
          ))}
          {versions.length === 0 && <p className="text-sm text-muted-foreground">{t("universalOperations.configuration.advanced.noVersions")}</p>}
        </div>
      </WorkspacePanel>
      <WorkspacePanel title={t("universalOperations.configuration.advanced.sla")}>
        {sla.rules.map((rule) => (
          <div key={rule.id} className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-border/50 p-2">
            <Input value={rule.name} onChange={(e) => updateDraft({ sla: { rules: sla.rules.map((r) => (r.id === rule.id ? { ...r, name: e.target.value } : r)) } })} />
            <Input type="number" value={rule.thresholdMinutes} onChange={(e) => updateDraft({ sla: { rules: sla.rules.map((r) => (r.id === rule.id ? { ...r, thresholdMinutes: Number(e.target.value) } : r)) } })} />
            <Switch checked={rule.enabled} onCheckedChange={(checked) => updateDraft({ sla: { rules: sla.rules.map((r) => (r.id === rule.id ? { ...r, enabled: checked } : r)) } })} />
            <Button type="button" size="icon" variant="ghost" className="text-destructive" onClick={() => updateDraft({ sla: { rules: sla.rules.filter((r) => r.id !== rule.id) } })}>
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}
        <Button type="button" size="sm" variant="outline" onClick={() => updateDraft({ sla: { rules: [...sla.rules, { id: newId("sla"), name: "New SLA", thresholdMinutes: 15, alertType: "waiting_long", enabled: true }] } })}>
          <Plus className="me-1 size-3.5" />
          {t("universalOperations.configuration.add")}
        </Button>
      </WorkspacePanel>
      <WorkspacePanel title={t("universalOperations.configuration.advanced.queueRules")}>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>{t("universalOperations.configuration.advanced.pageSize")}</Label>
            <Input type="number" value={queueRules.pageSize} onChange={(e) => updateDraft({ queueRules: { ...queueRules, pageSize: Number(e.target.value) } })} />
          </div>
          <div className="space-y-1">
            <Label>{t("universalOperations.configuration.advanced.maxWaiting")}</Label>
            <Input type="number" value={queueRules.maxWaitingMinutes ?? 30} onChange={(e) => updateDraft({ queueRules: { ...queueRules, maxWaitingMinutes: Number(e.target.value) } })} />
          </div>
        </div>
      </WorkspacePanel>
      <WorkspacePanel title={t("universalOperations.configuration.advanced.forms")}>
        {forms.schemas.map((schema) => (
          <div key={schema.id} className="mb-2 flex items-center gap-2 rounded-lg border border-border/50 p-2">
            <Input value={schema.name} onChange={(e) => updateDraft({ forms: { schemas: forms.schemas.map((s) => (s.id === schema.id ? { ...s, name: e.target.value } : s)) } })} />
            <Input value={schema.entityType} onChange={(e) => updateDraft({ forms: { schemas: forms.schemas.map((s) => (s.id === schema.id ? { ...s, entityType: e.target.value } : s)) } })} />
            <Button type="button" size="icon" variant="ghost" className="text-destructive" onClick={() => updateDraft({ forms: { schemas: forms.schemas.filter((s) => s.id !== schema.id) } })}>
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}
        <Button type="button" size="sm" variant="outline" onClick={() => updateDraft({ forms: { schemas: [...forms.schemas, { id: newId("form"), name: "New Form", entityType: "booking", fields: [] }] } })}>
          <Plus className="me-1 size-3.5" />
          {t("universalOperations.configuration.add")}
        </Button>
      </WorkspacePanel>
      <WorkspacePanel title={t("universalOperations.configuration.advanced.layouts")}>
        <Customer360LayoutTab draft={draft} updateDraft={updateDraft} />
        <IntelligenceLayoutTab draft={draft} updateDraft={updateDraft} />
        <KanbanLayoutTab draft={draft} updateDraft={updateDraft} />
        <CalendarLayoutTab draft={draft} updateDraft={updateDraft} />
        <TimelineLayoutTab draft={draft} updateDraft={updateDraft} />
      </WorkspacePanel>
    </div>
  );
}
