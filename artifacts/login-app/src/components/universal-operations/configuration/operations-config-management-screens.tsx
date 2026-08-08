import { useTranslation } from "react-i18next";
import {
  OPERATIONS_FIELD_TYPES,
  type OperationsColumnDefinition,
  type OperationsPaymentStatusDefinition,
  type OperationsResourceDefinition,
  type OperationsServiceDefinition,
  type OperationsStatusDefinition,
} from "@workspace/universal-operations-engine";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DEFAULT_BRAND_COLORS } from "@/lib/company-workspace/brand-center/defaults";
import { moveItem, newId } from "./config-editor-shared";
import { OperationsConfigScreenShell } from "./operations-config-screen-shell";
import { TableRowActions } from "./operations-config-table-actions";
import type { ConfigTabEditorProps } from "./operations-config-tab-types";

const DEFAULT_ENTITY_ACCENT = DEFAULT_BRAND_COLORS.primary;

type ShellProps = ConfigTabEditorProps & {
  onBack: () => void;
};

function EmptyRow({ colSpan, message }: { colSpan: number; message: string }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="py-8 text-center text-sm text-muted-foreground">
        {message}
      </TableCell>
    </TableRow>
  );
}

export function ColumnsManagementScreen({ draft, updateDraft, readOnly, onBack }: ShellProps) {
  const { t } = useTranslation("common");
  const columns = [...draft.columns].sort((a, b) => a.position - b.position);

  const patchColumns = (next: OperationsColumnDefinition[]) => {
    updateDraft({ columns: next.map((c, i) => ({ ...c, position: i })) });
  };

  const addColumn = () => {
    patchColumns([
      ...columns,
      {
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
      },
    ]);
  };

  return (
    <OperationsConfigScreenShell
      title={t("universalOperations.configuration.tasks.manageColumns")}
      description={t("universalOperations.configuration.tabDescriptions.columns")}
      addLabel={t("universalOperations.configuration.tasks.addColumn")}
      onBack={onBack}
      onAdd={addColumn}
      readOnly={readOnly}
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-24">{t("universalOperations.configuration.table.order")}</TableHead>
            <TableHead>{t("universalOperations.configuration.columns.displayName")}</TableHead>
            <TableHead>{t("universalOperations.configuration.columns.internalName")}</TableHead>
            <TableHead>{t("universalOperations.configuration.columns.fieldType")}</TableHead>
            <TableHead className="w-20">{t("universalOperations.configuration.columns.visible")}</TableHead>
            <TableHead className="w-24">{t("universalOperations.configuration.columns.width")}</TableHead>
            <TableHead className="w-28">{t("universalOperations.configuration.table.actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {columns.length === 0 ? (
            <EmptyRow colSpan={7} message={t("universalOperations.configuration.tasks.emptyColumns")} />
          ) : (
            columns.map((col, index) => (
              <TableRow key={col.id}>
                <TableCell className="text-xs text-muted-foreground">{index + 1}</TableCell>
                <TableCell>
                  <Input
                    value={col.displayName}
                    disabled={readOnly}
                    onChange={(e) => patchColumns(columns.map((c) => (c.id === col.id ? { ...c, displayName: e.target.value } : c)))}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={col.internalName}
                    disabled={readOnly}
                    onChange={(e) => patchColumns(columns.map((c) => (c.id === col.id ? { ...c, internalName: e.target.value } : c)))}
                  />
                </TableCell>
                <TableCell>
                  <select
                    value={col.type}
                    disabled={readOnly}
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                    onChange={(e) => patchColumns(columns.map((c) => (c.id === col.id ? { ...c, type: e.target.value as OperationsColumnDefinition["type"] } : c)))}
                  >
                    {OPERATIONS_FIELD_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </TableCell>
                <TableCell>
                  <Switch
                    checked={col.visible}
                    disabled={readOnly}
                    onCheckedChange={(checked) => patchColumns(columns.map((c) => (c.id === col.id ? { ...c, visible: checked } : c)))}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    value={col.width}
                    disabled={readOnly}
                    className="w-20"
                    onChange={(e) => patchColumns(columns.map((c) => (c.id === col.id ? { ...c, width: Number(e.target.value) } : c)))}
                  />
                </TableCell>
                <TableCell>
                  <TableRowActions
                    index={index}
                    total={columns.length}
                    disabled={readOnly}
                    onMoveUp={() => patchColumns(moveItem(columns, index, index - 1))}
                    onMoveDown={() => patchColumns(moveItem(columns, index, index + 1))}
                    onDelete={() => patchColumns(columns.filter((c) => c.id !== col.id))}
                  />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </OperationsConfigScreenShell>
  );
}

export function StatusesManagementScreen({ draft, updateDraft, readOnly, onBack }: ShellProps) {
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
        color: DEFAULT_ENTITY_ACCENT,
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
    updateDraft({ statusTransitions: [...transitions, { fromStatusId: from, toStatusId: to }] });
  };

  return (
    <OperationsConfigScreenShell
      title={t("universalOperations.configuration.tasks.manageStatuses")}
      description={t("universalOperations.configuration.tabDescriptions.statuses")}
      addLabel={t("universalOperations.configuration.tasks.addStatus")}
      onBack={onBack}
      onAdd={addStatus}
      readOnly={readOnly}
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-24">{t("universalOperations.configuration.table.order")}</TableHead>
            <TableHead>{t("universalOperations.configuration.fields.displayName")}</TableHead>
            <TableHead>{t("universalOperations.configuration.fields.internalName")}</TableHead>
            <TableHead className="w-20">{t("universalOperations.configuration.fields.color")}</TableHead>
            <TableHead className="w-24">{t("universalOperations.configuration.statuses.terminal")}</TableHead>
            <TableHead className="w-28">{t("universalOperations.configuration.table.actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {statuses.length === 0 ? (
            <EmptyRow colSpan={6} message={t("universalOperations.configuration.tasks.emptyStatuses")} />
          ) : (
            statuses.map((status, index) => (
              <TableRow key={status.id}>
                <TableCell className="text-xs text-muted-foreground">{index + 1}</TableCell>
                <TableCell>
                  <Input
                    value={status.displayName}
                    disabled={readOnly}
                    onChange={(e) => patchStatuses(statuses.map((s) => (s.id === status.id ? { ...s, displayName: e.target.value } : s)))}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={status.internalName}
                    disabled={readOnly}
                    onChange={(e) => patchStatuses(statuses.map((s) => (s.id === status.id ? { ...s, internalName: e.target.value } : s)))}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="color"
                    value={status.color}
                    disabled={readOnly}
                    className="h-9 w-14 p-1"
                    onChange={(e) => patchStatuses(statuses.map((s) => (s.id === status.id ? { ...s, color: e.target.value } : s)))}
                  />
                </TableCell>
                <TableCell>
                  <Switch
                    checked={status.isTerminal}
                    disabled={readOnly}
                    onCheckedChange={(checked) => patchStatuses(statuses.map((s) => (s.id === status.id ? { ...s, isTerminal: checked } : s)))}
                  />
                </TableCell>
                <TableCell>
                  <TableRowActions
                    index={index}
                    total={statuses.length}
                    disabled={readOnly}
                    onMoveUp={() => patchStatuses(moveItem(statuses, index, index - 1))}
                    onMoveDown={() => patchStatuses(moveItem(statuses, index, index + 1))}
                    onDelete={() => patchStatuses(statuses.filter((s) => s.id !== status.id))}
                  />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <div className="mt-8 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="text-sm font-semibold">{t("universalOperations.configuration.statuses.transitions")}</h4>
            <p className="text-xs text-muted-foreground">{t("universalOperations.configuration.statuses.flowHint")}</p>
          </div>
          <button
            type="button"
            disabled={readOnly || statuses.length < 2}
            onClick={addTransition}
            className="text-sm font-medium text-primary hover:underline disabled:opacity-50"
          >
            + {t("universalOperations.configuration.tasks.addTransition")}
          </button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("universalOperations.configuration.statuses.fromStatus")}</TableHead>
              <TableHead>{t("universalOperations.configuration.statuses.toStatus")}</TableHead>
              <TableHead className="w-20">{t("universalOperations.configuration.table.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transitions.length === 0 ? (
              <EmptyRow colSpan={3} message={t("universalOperations.configuration.tasks.emptyTransitions")} />
            ) : (
              transitions.map((tr, index) => (
                <TableRow key={`${tr.fromStatusId}-${tr.toStatusId}-${index}`}>
                  <TableCell>
                    <select
                      value={tr.fromStatusId}
                      disabled={readOnly}
                      className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                      onChange={(e) =>
                        updateDraft({
                          statusTransitions: transitions.map((row, i) => (i === index ? { ...row, fromStatusId: e.target.value } : row)),
                        })
                      }
                    >
                      {statuses.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.displayName}
                        </option>
                      ))}
                    </select>
                  </TableCell>
                  <TableCell>
                    <select
                      value={tr.toStatusId}
                      disabled={readOnly}
                      className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                      onChange={(e) =>
                        updateDraft({
                          statusTransitions: transitions.map((row, i) => (i === index ? { ...row, toStatusId: e.target.value } : row)),
                        })
                      }
                    >
                      {statuses.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.displayName}
                        </option>
                      ))}
                    </select>
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      disabled={readOnly}
                      onClick={() => updateDraft({ statusTransitions: transitions.filter((_, i) => i !== index) })}
                      className="text-sm text-destructive hover:underline disabled:opacity-50"
                    >
                      {t("universalOperations.configuration.table.delete")}
                    </button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </OperationsConfigScreenShell>
  );
}

export function ServicesManagementScreen({ draft, updateDraft, readOnly, onBack }: ShellProps) {
  const { t } = useTranslation("common");
  const items = draft.services ?? [];
  const patch = (next: OperationsServiceDefinition[]) => updateDraft({ services: next });

  const addService = () => {
    patch([
      ...items,
      {
        id: newId("svc"),
        name: "New Service",
        priceCents: 0,
        durationMinutes: 30,
        vatPercent: 15,
        resourceIds: [],
        color: DEFAULT_ENTITY_ACCENT,
        capacity: 1,
        onlineBooking: true,
        cancellationPolicy: "",
        bufferMinutes: 0,
        active: true,
      },
    ]);
  };

  return (
    <OperationsConfigScreenShell
      title={t("universalOperations.configuration.tasks.manageServices")}
      description={t("universalOperations.configuration.tabDescriptions.services")}
      addLabel={t("universalOperations.configuration.tasks.addService")}
      onBack={onBack}
      onAdd={addService}
      readOnly={readOnly}
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("universalOperations.configuration.services.name")}</TableHead>
            <TableHead>{t("universalOperations.configuration.services.priceCents")}</TableHead>
            <TableHead>{t("universalOperations.configuration.services.duration")}</TableHead>
            <TableHead className="w-20">{t("universalOperations.configuration.active")}</TableHead>
            <TableHead className="w-20">{t("universalOperations.configuration.table.actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <EmptyRow colSpan={5} message={t("universalOperations.configuration.tasks.emptyServices")} />
          ) : (
            items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <Input
                    value={item.name}
                    disabled={readOnly}
                    onChange={(e) => patch(items.map((s) => (s.id === item.id ? { ...s, name: e.target.value } : s)))}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    value={item.priceCents}
                    disabled={readOnly}
                    onChange={(e) => patch(items.map((s) => (s.id === item.id ? { ...s, priceCents: Number(e.target.value) } : s)))}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    value={item.durationMinutes}
                    disabled={readOnly}
                    onChange={(e) => patch(items.map((s) => (s.id === item.id ? { ...s, durationMinutes: Number(e.target.value) } : s)))}
                  />
                </TableCell>
                <TableCell>
                  <Switch
                    checked={item.active}
                    disabled={readOnly}
                    onCheckedChange={(checked) => patch(items.map((s) => (s.id === item.id ? { ...s, active: checked } : s)))}
                  />
                </TableCell>
                <TableCell>
                  <button
                    type="button"
                    disabled={readOnly}
                    onClick={() => patch(items.filter((s) => s.id !== item.id))}
                    className="text-sm text-destructive hover:underline disabled:opacity-50"
                  >
                    {t("universalOperations.configuration.table.delete")}
                  </button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </OperationsConfigScreenShell>
  );
}

export function ResourcesManagementScreen({ draft, updateDraft, readOnly, onBack }: ShellProps) {
  const { t } = useTranslation("common");
  const items = draft.resources ?? [];
  const patch = (next: OperationsResourceDefinition[]) => updateDraft({ resources: next });

  const addResource = () => {
    patch([...items, { id: newId("res"), name: "New Resource", type: "room", branchId: null, color: DEFAULT_ENTITY_ACCENT, active: true }]);
  };

  return (
    <OperationsConfigScreenShell
      title={t("universalOperations.configuration.tasks.manageResources")}
      description={t("universalOperations.configuration.tabDescriptions.resources")}
      addLabel={t("universalOperations.configuration.tasks.addResource")}
      onBack={onBack}
      onAdd={addResource}
      readOnly={readOnly}
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("universalOperations.configuration.resources.name")}</TableHead>
            <TableHead>{t("universalOperations.configuration.resources.type")}</TableHead>
            <TableHead className="w-20">{t("universalOperations.configuration.fields.color")}</TableHead>
            <TableHead className="w-20">{t("universalOperations.configuration.active")}</TableHead>
            <TableHead className="w-20">{t("universalOperations.configuration.table.actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <EmptyRow colSpan={5} message={t("universalOperations.configuration.tasks.emptyResources")} />
          ) : (
            items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <Input
                    value={item.name}
                    disabled={readOnly}
                    onChange={(e) => patch(items.map((r) => (r.id === item.id ? { ...r, name: e.target.value } : r)))}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={item.type}
                    disabled={readOnly}
                    onChange={(e) => patch(items.map((r) => (r.id === item.id ? { ...r, type: e.target.value } : r)))}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="color"
                    value={item.color}
                    disabled={readOnly}
                    className="h-9 w-14 p-1"
                    onChange={(e) => patch(items.map((r) => (r.id === item.id ? { ...r, color: e.target.value } : r)))}
                  />
                </TableCell>
                <TableCell>
                  <Switch
                    checked={item.active}
                    disabled={readOnly}
                    onCheckedChange={(checked) => patch(items.map((r) => (r.id === item.id ? { ...r, active: checked } : r)))}
                  />
                </TableCell>
                <TableCell>
                  <button
                    type="button"
                    disabled={readOnly}
                    onClick={() => patch(items.filter((r) => r.id !== item.id))}
                    className="text-sm text-destructive hover:underline disabled:opacity-50"
                  >
                    {t("universalOperations.configuration.table.delete")}
                  </button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </OperationsConfigScreenShell>
  );
}

export function PermissionsManagementScreen({ draft, updateDraft, readOnly, onBack }: ShellProps) {
  const { t } = useTranslation("common");
  const permissions = draft.permissions ?? { columns: {}, statuses: {}, actions: {} };

  type PermissionRow = { section: "columns" | "statuses" | "actions"; entityId: string; roles: string[] };

  const rows: PermissionRow[] = [
    ...Object.entries(permissions.columns).map(([entityId, roles]) => ({ section: "columns" as const, entityId, roles: roles ?? [] })),
    ...Object.entries(permissions.statuses).map(([entityId, roles]) => ({ section: "statuses" as const, entityId, roles: roles ?? [] })),
    ...Object.entries(permissions.actions).map(([entityId, roles]) => ({ section: "actions" as const, entityId, roles: roles ?? [] })),
  ];

  const sectionLabel = (section: PermissionRow["section"]) => {
    if (section === "columns") return t("universalOperations.configuration.permissions.columns");
    if (section === "statuses") return t("universalOperations.configuration.permissions.statuses");
    return t("universalOperations.configuration.permissions.actions");
  };

  const updateRow = (index: number, patch: Partial<PermissionRow>) => {
    const row = rows[index];
    if (!row) return;
    const nextSection = patch.section ?? row.section;
    const nextEntityId = patch.entityId ?? row.entityId;
    const nextRoles = patch.roles ?? row.roles;

    const updated = { ...permissions };
    for (const section of ["columns", "statuses", "actions"] as const) {
      updated[section] = { ...updated[section] };
    }

    if (row.section !== nextSection || row.entityId !== nextEntityId) {
      delete updated[row.section][row.entityId];
    }
    updated[nextSection][nextEntityId] = nextRoles;
    updateDraft({ permissions: updated });
  };

  const deleteRow = (index: number) => {
    const row = rows[index];
    if (!row) return;
    const updated = { ...permissions, [row.section]: { ...permissions[row.section] } };
    delete updated[row.section][row.entityId];
    updateDraft({ permissions: updated });
  };

  const addPermission = () => {
    const entityId = draft.columns[0]?.id ?? "col_new";
    updateDraft({
      permissions: {
        ...permissions,
        columns: { ...permissions.columns, [entityId]: ["manager"] },
      },
    });
  };

  return (
    <OperationsConfigScreenShell
      title={t("universalOperations.configuration.tasks.managePermissions")}
      description={t("universalOperations.configuration.tabDescriptions.permissions")}
      addLabel={t("universalOperations.configuration.tasks.addPermission")}
      onBack={onBack}
      onAdd={addPermission}
      readOnly={readOnly}
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("universalOperations.configuration.table.type")}</TableHead>
            <TableHead>{t("universalOperations.configuration.table.item")}</TableHead>
            <TableHead>{t("universalOperations.configuration.table.allowedRoles")}</TableHead>
            <TableHead className="w-20">{t("universalOperations.configuration.table.actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <EmptyRow colSpan={4} message={t("universalOperations.configuration.tasks.emptyPermissions")} />
          ) : (
            rows.map((row, index) => (
              <TableRow key={`${row.section}-${row.entityId}`}>
                <TableCell className="text-sm">{sectionLabel(row.section)}</TableCell>
                <TableCell>
                  {row.section === "actions" ? (
                    <Input
                      value={row.entityId}
                      disabled={readOnly}
                      onChange={(e) => updateRow(index, { entityId: e.target.value })}
                    />
                  ) : (
                    <select
                      value={row.entityId}
                      disabled={readOnly}
                      className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                      onChange={(e) => updateRow(index, { entityId: e.target.value })}
                    >
                      {row.section === "columns"
                        ? draft.columns.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.displayName}
                            </option>
                          ))
                        : draft.statuses.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.displayName}
                            </option>
                          ))}
                    </select>
                  )}
                </TableCell>
                <TableCell>
                  <Input
                    value={row.roles.join(", ")}
                    disabled={readOnly}
                    placeholder={t("universalOperations.configuration.permissions.rolesPlaceholder")}
                    onChange={(e) =>
                      updateRow(index, {
                        roles: e.target.value
                          .split(",")
                          .map((r) => r.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                </TableCell>
                <TableCell>
                  <button
                    type="button"
                    disabled={readOnly}
                    onClick={() => deleteRow(index)}
                    className="text-sm text-destructive hover:underline disabled:opacity-50"
                  >
                    {t("universalOperations.configuration.table.delete")}
                  </button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </OperationsConfigScreenShell>
  );
}

export function PaymentStatusesManagementScreen({ draft, updateDraft, readOnly, onBack }: ShellProps) {
  const { t } = useTranslation("common");
  const items = draft.paymentStatuses ?? [];
  const patch = (next: OperationsPaymentStatusDefinition[]) => updateDraft({ paymentStatuses: next });

  const addItem = () => {
    patch([...items, { id: newId("pay"), internalName: "new", displayName: "New", color: DEFAULT_ENTITY_ACCENT, sortOrder: items.length }]);
  };

  return (
    <OperationsConfigScreenShell
      title={t("universalOperations.configuration.tabs.payment_status")}
      description={t("universalOperations.configuration.tabDescriptions.payment_status")}
      addLabel={t("universalOperations.configuration.tasks.addPaymentStatus")}
      onBack={onBack}
      onAdd={addItem}
      readOnly={readOnly}
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("universalOperations.configuration.fields.displayName")}</TableHead>
            <TableHead>{t("universalOperations.configuration.fields.internalName")}</TableHead>
            <TableHead className="w-20">{t("universalOperations.configuration.fields.color")}</TableHead>
            <TableHead className="w-28">{t("universalOperations.configuration.table.actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <EmptyRow colSpan={4} message={t("universalOperations.configuration.tasks.emptyPaymentStatuses")} />
          ) : (
            items.map((item, index) => (
              <TableRow key={item.id}>
                <TableCell>
                  <Input value={item.displayName} disabled={readOnly} onChange={(e) => patch(items.map((p) => (p.id === item.id ? { ...p, displayName: e.target.value } : p)))} />
                </TableCell>
                <TableCell>
                  <Input value={item.internalName} disabled={readOnly} onChange={(e) => patch(items.map((p) => (p.id === item.id ? { ...p, internalName: e.target.value } : p)))} />
                </TableCell>
                <TableCell>
                  <Input type="color" value={item.color} disabled={readOnly} className="h-9 w-14 p-1" onChange={(e) => patch(items.map((p) => (p.id === item.id ? { ...p, color: e.target.value } : p)))} />
                </TableCell>
                <TableCell>
                  <TableRowActions
                    index={index}
                    total={items.length}
                    disabled={readOnly}
                    onMoveUp={() => patch(moveItem(items, index, index - 1).map((p, i) => ({ ...p, sortOrder: i })))}
                    onMoveDown={() => patch(moveItem(items, index, index + 1).map((p, i) => ({ ...p, sortOrder: i })))}
                    onDelete={() => patch(items.filter((p) => p.id !== item.id))}
                  />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </OperationsConfigScreenShell>
  );
}
