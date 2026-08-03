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

export class QueueDataEngine {
  filterRows(rows: OperationsRow[], query: OperationsQueueQuery): OperationsRow[] {
    let result = [...rows];
    const search = query.search?.trim().toLowerCase();
    if (search) {
      result = result.filter((row) =>
        Object.values(row.values).some((v) => String(v ?? "").toLowerCase().includes(search)),
      );
    }

    if (query.sort?.length) {
      const [{ columnId, direction }] = query.sort;
      const columnKey = columnId.replace(/^col_/, "").replace(/_/g, "_");
      result.sort((a, b) => {
        const av = a.values[columnKey] ?? a.values[columnId] ?? "";
        const bv = b.values[columnKey] ?? b.values[columnId] ?? "";
        const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
        return direction === "asc" ? cmp : -cmp;
      });
    }

    return result;
  }

  paginate(rows: OperationsRow[], query: OperationsQueueQuery): OperationsQueuePage {
    const filtered = this.filterRows(rows, query);
    const start = (query.page - 1) * query.pageSize;
    const pageRows = filtered.slice(start, start + query.pageSize);
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
