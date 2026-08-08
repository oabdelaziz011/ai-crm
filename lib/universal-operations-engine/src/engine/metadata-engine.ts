import type { OperationsColumnDefinition, OperationsWorkspaceConfig } from "../types/metadata-types.js";
import type { OperationsGridPreferences, OperationsQueuePage, OperationsQueueQuery, OperationsRow } from "../types/row-types.js";

export class MetadataEngine {
  resolveDisplayName(config: OperationsWorkspaceConfig, internalName: string): string {
    const column = config.columns.find((c) => c.internalName === internalName);
    if (column) return column.displayName;
    const term = config.terminology[internalName as keyof typeof config.terminology];
    return term ?? internalName;
  }

  visibleColumns(config: OperationsWorkspaceConfig, preferences?: OperationsGridPreferences): OperationsColumnDefinition[] {
    const hidden = new Set(preferences?.hiddenColumnIds ?? []);
    const order = preferences?.columnOrder?.length
      ? preferences.columnOrder
      : config.columns.map((c) => c.id);

    const byId = new Map(config.columns.map((c) => [c.id, c]));
    return order
      .map((id) => byId.get(id))
      .filter((c): c is OperationsColumnDefinition => Boolean(c))
      .filter((c) => c.visible && !hidden.has(c.id))
      .map((c) => ({
        ...c,
        width: preferences?.columnWidths[c.id] ?? c.width,
        pinned: preferences?.pinnedColumns[c.id] ?? c.pinned ?? null,
      }));
  }

  applyColumnPatch(
    config: OperationsWorkspaceConfig,
    columnId: string,
    patch: Partial<OperationsColumnDefinition>,
  ): OperationsWorkspaceConfig {
    return {
      ...config,
      columns: config.columns.map((c) => (c.id === columnId ? { ...c, ...patch } : c)),
      updatedAt: new Date().toISOString(),
    };
  }

  reorderColumns(config: OperationsWorkspaceConfig, columnIds: string[]): OperationsWorkspaceConfig {
    const byId = new Map(config.columns.map((c) => [c.id, c]));
    const reordered = columnIds
      .map((id, index) => {
        const col = byId.get(id);
        return col ? { ...col, position: index } : null;
      })
      .filter((c): c is OperationsColumnDefinition => Boolean(c));

    const missing = config.columns.filter((c) => !columnIds.includes(c.id));
    return {
      ...config,
      columns: [...reordered, ...missing.map((c, i) => ({ ...c, position: reordered.length + i }))],
      updatedAt: new Date().toISOString(),
    };
  }
}

const SORT_COLUMN_ALIASES: Record<string, string> = {
  col_scheduled: "scheduled_at",
  col_appointment_time: "scheduled_at",
  col_waiting: "waiting_minutes",
  col_ref: "reference",
  col_customer: "customer",
  col_phone: "phone",
  col_service: "service",
  col_resource: "resource",
  col_status: "status",
  col_payment: "payment_status",
  col_amount: "amount",
  col_branch: "branch",
  col_duration: "duration_minutes",
  col_queue_number: "queue_number",
  col_visit_type: "visit_type",
};

function resolveSortValueKey(columnId: string): string {
  return SORT_COLUMN_ALIASES[columnId] ?? columnId.replace(/^col_/, "");
}

function matchesFilterValue(rowValue: unknown, expected: unknown): boolean {
  if (expected == null || expected === "" || expected === "all") return true;
  if (Array.isArray(expected)) {
    return expected.some((item) => matchesFilterValue(rowValue, item));
  }
  return String(rowValue ?? "").toLowerCase() === String(expected).toLowerCase();
}

export class QueueDataEngine {
  filterRows(rows: OperationsRow[], query: OperationsQueueQuery): OperationsRow[] {
    let result = [...rows];
    const search = query.search?.trim().toLowerCase();
    if (search) {
      result = result.filter((row) =>
        Object.values(row.values).some((v) => String(v ?? "").toLowerCase().includes(search)),
      );
    }

    const filters = query.filters ?? {};
    const statusId = filters.statusId ?? filters.status;
    if (statusId != null && statusId !== "" && statusId !== "all") {
      result = result.filter((row) =>
        matchesFilterValue(row.statusId, statusId) || matchesFilterValue(row.values.status, statusId),
      );
    }

    const resource = filters.resource ?? filters.doctor ?? filters.assignedResourceId;
    if (resource != null && resource !== "" && resource !== "all") {
      result = result.filter(
        (row) =>
          matchesFilterValue(row.values.resource, resource) ||
          matchesFilterValue(row.assignedResourceId, resource),
      );
    }

    const service = filters.service;
    if (service != null && service !== "" && service !== "all") {
      result = result.filter((row) => matchesFilterValue(row.values.service, service));
    }

    const branch = filters.branch;
    if (branch != null && branch !== "" && branch !== "all") {
      result = result.filter((row) => matchesFilterValue(row.values.branch, branch));
    }

    const paymentStatusId = filters.paymentStatusId;
    if (paymentStatusId != null && paymentStatusId !== "" && paymentStatusId !== "all") {
      result = result.filter((row) => matchesFilterValue(row.paymentStatusId, paymentStatusId));
    }

    if (query.sort?.length) {
      const [{ columnId, direction }] = query.sort;
      const columnKey = resolveSortValueKey(columnId);
      result.sort((a, b) => {
        const av = a.values[columnKey] ?? a.values[columnId] ?? "";
        const bv = b.values[columnKey] ?? b.values[columnId] ?? "";
        if (columnKey === "scheduled_at" || columnKey === "appointment_time") {
          const at = new Date(String(av)).getTime();
          const bt = new Date(String(bv)).getTime();
          if (!Number.isNaN(at) && !Number.isNaN(bt)) {
            return direction === "asc" ? at - bt : bt - at;
          }
        }
        if (columnKey === "waiting_minutes" || columnKey === "duration_minutes" || columnKey === "amount") {
          const an = Number(av) || 0;
          const bn = Number(bv) || 0;
          return direction === "asc" ? an - bn : bn - an;
        }
        const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
        return direction === "asc" ? cmp : -cmp;
      });
    }

    return result;
  }

  paginate(rows: OperationsRow[], query: OperationsQueueQuery): OperationsQueuePage {
    const filtered = this.filterRows(rows, query);
    const start = (query.page - 1) * query.pageSize;
    const pageRows = filtered.slice(start, start + query.pageSize).map((row, index) => ({
      ...row,
      values: {
        ...row.values,
        queue_number: start + index + 1,
      },
    }));
    return {
      rows: pageRows,
      total: filtered.length,
      page: query.page,
      pageSize: query.pageSize,
      hasMore: start + query.pageSize < filtered.length,
    };
  }
}

export const metadataEngine = new MetadataEngine();
export const queueDataEngine = new QueueDataEngine();
