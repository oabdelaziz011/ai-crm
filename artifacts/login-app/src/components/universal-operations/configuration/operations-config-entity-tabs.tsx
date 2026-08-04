import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  OPERATIONS_FIELD_TYPES,
  type OperationsColumnDefinition,
  type OperationsPaymentStatusDefinition,
  type OperationsResourceDefinition,
  type OperationsServiceDefinition,
  type OperationsStatusDefinition,
  type OperationsStatusTransition,
} from "@workspace/universal-operations-engine";
import { WorkspacePanel } from "@/components/customer-workspace/workspace-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { moveItem, newId } from "./config-editor-shared";
import type { ConfigTabEditorProps } from "./operations-config-tab-types";

function RowActions({
  index,
  total,
  onMoveUp,
  onMoveDown,
  onDelete,
}: {
  index: number;
  total: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex shrink-0 gap-1">
      <Button type="button" size="icon" variant="ghost" className="size-7" disabled={index === 0} onClick={onMoveUp}>
        <ChevronUp className="size-3.5" />
      </Button>
      <Button type="button" size="icon" variant="ghost" className="size-7" disabled={index >= total - 1} onClick={onMoveDown}>
        <ChevronDown className="size-3.5" />
      </Button>
      <Button type="button" size="icon" variant="ghost" className="size-7 text-destructive" onClick={onDelete}>
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}

export function GeneralConfigTab({ draft, updateDraft }: ConfigTabEditorProps) {
  const { t } = useTranslation("common");
  const terminologyKeys = ["customer", "resource", "service", "queue", "payment", "appointment", "employee", "branch"] as const;

  return (
    <WorkspacePanel title={t("universalOperations.configuration.general.title")}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>{t("universalOperations.configuration.general.workspaceName")}</Label>
          <Input value={draft.workspaceName} onChange={(e) => updateDraft({ workspaceName: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>{t("universalOperations.configuration.general.moduleName")}</Label>
          <Input value={draft.moduleName} onChange={(e) => updateDraft({ moduleName: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>{t("universalOperations.configuration.general.rowEntity")}</Label>
          <Input value={draft.rowEntityName} onChange={(e) => updateDraft({ rowEntityName: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>{t("universalOperations.configuration.branding.accentColor")}</Label>
          <Input
            type="color"
            value={draft.branding?.accentColor ?? "#6366f1"}
            onChange={(e) =>
              updateDraft({ branding: { ...draft.branding, accentColor: e.target.value, icon: draft.branding?.icon ?? "LayoutGrid", moduleIcon: draft.branding?.moduleIcon ?? "Stethoscope" } })
            }
          />
        </div>
        <div className="space-y-2">
          <Label>{t("universalOperations.configuration.branding.icon")}</Label>
          <Input
            value={draft.branding?.icon ?? ""}
            onChange={(e) =>
              updateDraft({ branding: { ...draft.branding, icon: e.target.value, accentColor: draft.branding?.accentColor ?? "#6366f1", moduleIcon: draft.branding?.moduleIcon ?? "Stethoscope" } })
            }
          />
        </div>
        <div className="space-y-2">
          <Label>{t("universalOperations.configuration.branding.moduleIcon")}</Label>
          <Input
            value={draft.branding?.moduleIcon ?? ""}
            onChange={(e) =>
              updateDraft({ branding: { ...draft.branding, moduleIcon: e.target.value, accentColor: draft.branding?.accentColor ?? "#6366f1", icon: draft.branding?.icon ?? "LayoutGrid" } })
            }
          />
        </div>
      </div>
      <div className="mt-6">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("universalOperations.configuration.terminology.title")}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {terminologyKeys.map((key) => (
            <div key={key} className="space-y-1">
              <Label className="capitalize">{t(`universalOperations.configuration.terminology.${key}`)}</Label>
              <Input
                value={draft.terminology[key] ?? ""}
                onChange={(e) => updateDraft({ terminology: { ...draft.terminology, [key]: e.target.value } })}
              />
            </div>
          ))}
        </div>
      </div>
    </WorkspacePanel>
  );
}

export function ColumnsConfigTab({ draft, updateDraft }: ConfigTabEditorProps) {
  const { t } = useTranslation("common");
  const columns = [...draft.columns].sort((a, b) => a.position - b.position);

  const patchColumns = (next: OperationsColumnDefinition[]) => {
    updateDraft({ columns: next.map((c, i) => ({ ...c, position: i })) });
  };

  const addColumn = () => {
    const col: OperationsColumnDefinition = {
      id: newId("col"),
      internalName: "new_field",
      displayName: "New Field",
      icon: null,
      type: "text",
      visible: true,
      required: false,
      sortable: true,
      filterable: true,
      searchable: false,
      exportable: true,
      reportable: true,
      aiIndexed: false,
      width: 160,
      alignment: "start",
      defaultValue: null,
      validation: null,
      permissions: [],
      position: columns.length,
      pinned: null,
    };
    patchColumns([...columns, col]);
  };

  return (
    <WorkspacePanel title={t("universalOperations.configuration.columns.title")}>
      <div className="mb-3 flex justify-end">
        <Button type="button" size="sm" variant="outline" onClick={addColumn}>
          <Plus className="me-1 size-3.5" />
          {t("universalOperations.configuration.add")}
        </Button>
      </div>
      <div className="space-y-2">
        {columns.map((col, index) => (
          <div key={col.id} className="rounded-lg border border-border/50 p-3">
            <div className="flex flex-wrap items-start gap-3">
              <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-3">
                <Input
                  value={col.displayName}
                  placeholder={t("universalOperations.configuration.columns.displayName")}
                  onChange={(e) => patchColumns(columns.map((c) => (c.id === col.id ? { ...c, displayName: e.target.value } : c)))}
                />
                <Input
                  value={col.internalName}
                  placeholder={t("universalOperations.configuration.columns.internalName")}
                  onChange={(e) => patchColumns(columns.map((c) => (c.id === col.id ? { ...c, internalName: e.target.value } : c)))}
                />
                <select
                  value={col.type}
                  className="h-9 rounded-md border border-input bg-background px-2 text-xs"
                  onChange={(e) => patchColumns(columns.map((c) => (c.id === col.id ? { ...c, type: e.target.value as OperationsColumnDefinition["type"] } : c)))}
                >
                  {OPERATIONS_FIELD_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
                <Input
                  type="number"
                  value={col.width}
                  placeholder={t("universalOperations.configuration.columns.width")}
                  onChange={(e) => patchColumns(columns.map((c) => (c.id === col.id ? { ...c, width: Number(e.target.value) } : c)))}
                />
                <select
                  value={col.pinned ?? ""}
                  className="h-9 rounded-md border border-input bg-background px-2 text-xs"
                  onChange={(e) =>
                    patchColumns(
                      columns.map((c) =>
                        c.id === col.id ? { ...c, pinned: (e.target.value || null) as OperationsColumnDefinition["pinned"] } : c,
                      ),
                    )
                  }
                >
                  <option value="">{t("universalOperations.configuration.columns.unpinned")}</option>
                  <option value="left">{t("universalOperations.configuration.columns.pinLeft")}</option>
                  <option value="right">{t("universalOperations.configuration.columns.pinRight")}</option>
                </select>
              </div>
              <RowActions
                index={index}
                total={columns.length}
                onMoveUp={() => patchColumns(moveItem(columns, index, index - 1))}
                onMoveDown={() => patchColumns(moveItem(columns, index, index + 1))}
                onDelete={() => patchColumns(columns.filter((c) => c.id !== col.id))}
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-4">
              {(["visible", "required", "searchable", "exportable"] as const).map((flag) => (
                <label key={flag} className="flex items-center gap-2 text-xs">
                  <Switch
                    checked={col[flag]}
                    onCheckedChange={(checked) => patchColumns(columns.map((c) => (c.id === col.id ? { ...c, [flag]: checked } : c)))}
                  />
                  {t(`universalOperations.configuration.columns.${flag}`)}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </WorkspacePanel>
  );
}

export function StatusesConfigTab({ draft, updateDraft }: ConfigTabEditorProps) {
  const { t } = useTranslation("common");
  const statuses = [...draft.statuses].sort((a, b) => a.sortOrder - b.sortOrder);
  const transitions = draft.statusTransitions ?? [];

  const patchStatuses = (next: OperationsStatusDefinition[]) => {
    updateDraft({ statuses: next.map((s, i) => ({ ...s, sortOrder: i })) });
  };

  const addStatus = () => {
    patchStatuses([
      ...statuses,
      {
        id: newId("st"),
        internalName: "new_status",
        displayName: "New Status",
        color: "#6366f1",
        icon: "Circle",
        isTerminal: false,
        sortOrder: statuses.length,
        permissions: [],
      },
    ]);
  };

  const addTransition = () => {
    const from = statuses[0]?.id ?? "";
    const to = statuses[1]?.id ?? from;
    const next: OperationsStatusTransition = { fromStatusId: from, toStatusId: to };
    updateDraft({ statusTransitions: [...transitions, next] });
  };

  return (
    <div className="space-y-4">
      <WorkspacePanel title={t("universalOperations.configuration.statuses.title")}>
        <div className="mb-3 flex justify-end">
          <Button type="button" size="sm" variant="outline" onClick={addStatus}>
            <Plus className="me-1 size-3.5" />
            {t("universalOperations.configuration.add")}
          </Button>
        </div>
        <div className="space-y-2">
          {statuses.map((status, index) => (
            <div key={status.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border/50 p-3">
              <Input
                value={status.displayName}
                className="max-w-[160px]"
                onChange={(e) => patchStatuses(statuses.map((s) => (s.id === status.id ? { ...s, displayName: e.target.value } : s)))}
              />
              <Input
                value={status.internalName}
                className="max-w-[140px]"
                onChange={(e) => patchStatuses(statuses.map((s) => (s.id === status.id ? { ...s, internalName: e.target.value } : s)))}
              />
              <Input
                type="color"
                value={status.color}
                className="h-9 w-14 p-1"
                onChange={(e) => patchStatuses(statuses.map((s) => (s.id === status.id ? { ...s, color: e.target.value } : s)))}
              />
              <Input
                value={status.icon ?? ""}
                placeholder={t("universalOperations.configuration.statuses.icon")}
                className="max-w-[100px]"
                onChange={(e) => patchStatuses(statuses.map((s) => (s.id === status.id ? { ...s, icon: e.target.value } : s)))}
              />
              <label className="flex items-center gap-2 text-xs">
                <Switch
                  checked={status.isTerminal}
                  onCheckedChange={(checked) => patchStatuses(statuses.map((s) => (s.id === status.id ? { ...s, isTerminal: checked } : s)))}
                />
                {t("universalOperations.configuration.statuses.terminal")}
              </label>
              <RowActions
                index={index}
                total={statuses.length}
                onMoveUp={() => patchStatuses(moveItem(statuses, index, index - 1))}
                onMoveDown={() => patchStatuses(moveItem(statuses, index, index + 1))}
                onDelete={() => patchStatuses(statuses.filter((s) => s.id !== status.id))}
              />
            </div>
          ))}
        </div>
      </WorkspacePanel>
      <WorkspacePanel title={t("universalOperations.configuration.statuses.transitions")}>
        <div className="mb-3 flex justify-end">
          <Button type="button" size="sm" variant="outline" onClick={addTransition} disabled={statuses.length < 2}>
            <Plus className="me-1 size-3.5" />
            {t("universalOperations.configuration.add")}
          </Button>
        </div>
        <div className="space-y-2">
          {transitions.map((tr, index) => (
            <div key={`${tr.fromStatusId}-${tr.toStatusId}-${index}`} className="flex flex-wrap items-center gap-2">
              <select
                value={tr.fromStatusId}
                className="h-9 rounded-md border border-input bg-background px-2 text-xs"
                onChange={(e) =>
                  updateDraft({
                    statusTransitions: transitions.map((t, i) => (i === index ? { ...t, fromStatusId: e.target.value } : t)),
                  })
                }
              >
                {statuses.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.displayName}
                  </option>
                ))}
              </select>
              <span className="text-xs text-muted-foreground">→</span>
              <select
                value={tr.toStatusId}
                className="h-9 rounded-md border border-input bg-background px-2 text-xs"
                onChange={(e) =>
                  updateDraft({
                    statusTransitions: transitions.map((t, i) => (i === index ? { ...t, toStatusId: e.target.value } : t)),
                  })
                }
              >
                {statuses.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.displayName}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-7 text-destructive"
                onClick={() => updateDraft({ statusTransitions: transitions.filter((_, i) => i !== index) })}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </WorkspacePanel>
    </div>
  );
}

export function PaymentStatusConfigTab({ draft, updateDraft }: ConfigTabEditorProps) {
  const { t } = useTranslation("common");
  const items = draft.paymentStatuses ?? [];

  const patch = (next: OperationsPaymentStatusDefinition[]) => updateDraft({ paymentStatuses: next });

  return (
    <WorkspacePanel title={t("universalOperations.configuration.tabs.payment_status")}>
      <div className="mb-3 flex justify-end">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() =>
            patch([
              ...items,
              { id: newId("pay"), internalName: "new", displayName: "New", color: "#6366f1", sortOrder: items.length },
            ])
          }
        >
          <Plus className="me-1 size-3.5" />
          {t("universalOperations.configuration.add")}
        </Button>
      </div>
      <div className="space-y-2">
        {items.map((item, index) => (
          <div key={item.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border/50 p-3">
            <Input value={item.displayName} onChange={(e) => patch(items.map((p) => (p.id === item.id ? { ...p, displayName: e.target.value } : p)))} />
            <Input value={item.internalName} onChange={(e) => patch(items.map((p) => (p.id === item.id ? { ...p, internalName: e.target.value } : p)))} />
            <Input type="color" value={item.color} className="h-9 w-14 p-1" onChange={(e) => patch(items.map((p) => (p.id === item.id ? { ...p, color: e.target.value } : p)))} />
            <RowActions
              index={index}
              total={items.length}
              onMoveUp={() => patch(moveItem(items, index, index - 1).map((p, i) => ({ ...p, sortOrder: i })))}
              onMoveDown={() => patch(moveItem(items, index, index + 1).map((p, i) => ({ ...p, sortOrder: i })))}
              onDelete={() => patch(items.filter((p) => p.id !== item.id))}
            />
          </div>
        ))}
      </div>
    </WorkspacePanel>
  );
}

export function ServicesConfigTab({ draft, updateDraft }: ConfigTabEditorProps) {
  const { t } = useTranslation("common");
  const items = draft.services ?? [];
  const patch = (next: OperationsServiceDefinition[]) => updateDraft({ services: next });

  return (
    <WorkspacePanel title={t("universalOperations.configuration.tabs.services")}>
      <div className="mb-3 flex justify-end">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() =>
            patch([
              ...items,
              {
                id: newId("svc"),
                name: "New Service",
                priceCents: 0,
                durationMinutes: 30,
                vatPercent: 15,
                resourceIds: [],
                color: "#6366f1",
                capacity: 1,
                onlineBooking: true,
                cancellationPolicy: "",
                bufferMinutes: 0,
                active: true,
              },
            ])
          }
        >
          <Plus className="me-1 size-3.5" />
          {t("universalOperations.configuration.add")}
        </Button>
      </div>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.id} className="grid gap-2 rounded-lg border border-border/50 p-3 sm:grid-cols-4">
            <Input value={item.name} onChange={(e) => patch(items.map((s) => (s.id === item.id ? { ...s, name: e.target.value } : s)))} />
            <Input
              type="number"
              value={item.priceCents}
              placeholder={t("universalOperations.configuration.services.priceCents")}
              onChange={(e) => patch(items.map((s) => (s.id === item.id ? { ...s, priceCents: Number(e.target.value) } : s)))}
            />
            <Input
              type="number"
              value={item.durationMinutes}
              placeholder={t("universalOperations.configuration.services.duration")}
              onChange={(e) => patch(items.map((s) => (s.id === item.id ? { ...s, durationMinutes: Number(e.target.value) } : s)))}
            />
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-xs">
                <Switch checked={item.active} onCheckedChange={(checked) => patch(items.map((s) => (s.id === item.id ? { ...s, active: checked } : s)))} />
                {t("universalOperations.configuration.active")}
              </label>
              <Button type="button" size="icon" variant="ghost" className="size-7 text-destructive ms-auto" onClick={() => patch(items.filter((s) => s.id !== item.id))}>
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </WorkspacePanel>
  );
}

export function ResourcesConfigTab({ draft, updateDraft }: ConfigTabEditorProps) {
  const { t } = useTranslation("common");
  const items = draft.resources ?? [];
  const patch = (next: OperationsResourceDefinition[]) => updateDraft({ resources: next });

  return (
    <WorkspacePanel title={t("universalOperations.configuration.tabs.resources")}>
      <div className="mb-3 flex justify-end">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() =>
            patch([
              ...items,
              { id: newId("res"), name: "New Resource", type: "room", branchId: null, color: "#6366f1", active: true },
            ])
          }
        >
          <Plus className="me-1 size-3.5" />
          {t("universalOperations.configuration.add")}
        </Button>
      </div>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border/50 p-3">
            <Input value={item.name} onChange={(e) => patch(items.map((r) => (r.id === item.id ? { ...r, name: e.target.value } : r)))} />
            <Input value={item.type} onChange={(e) => patch(items.map((r) => (r.id === item.id ? { ...r, type: e.target.value } : r)))} />
            <Input type="color" value={item.color} className="h-9 w-14 p-1" onChange={(e) => patch(items.map((r) => (r.id === item.id ? { ...r, color: e.target.value } : r)))} />
            <label className="flex items-center gap-2 text-xs">
              <Switch checked={item.active} onCheckedChange={(checked) => patch(items.map((r) => (r.id === item.id ? { ...r, active: checked } : r)))} />
              {t("universalOperations.configuration.active")}
            </label>
            <Button type="button" size="icon" variant="ghost" className="size-7 text-destructive" onClick={() => patch(items.filter((r) => r.id !== item.id))}>
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}
      </div>
    </WorkspacePanel>
  );
}
