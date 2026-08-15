import { useCallback, useEffect, useState } from "react";
import {
  createDefaultFilters,
  DEFAULT_COLUMN_ORDER,
  DEFAULT_COLUMN_VISIBILITY,
  DEFAULT_COLUMN_WIDTHS,
  type CustomerColumnId,
  type CustomerListDensity,
  type CustomerListFilters,
  type CustomerListPreferences,
  type CustomerSortField,
  type CustomSavedView,
  type SortDirection,
} from "./types";

const STORAGE_KEY = "valueor-customers-list-prefs-v2";

function readStorage(): Partial<CustomerListPreferences> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Partial<CustomerListPreferences>;
  } catch {
    return null;
  }
}

function writeStorage(prefs: CustomerListPreferences): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // ignore quota errors
  }
}

function mergePreferences(stored: Partial<CustomerListPreferences> | null): CustomerListPreferences {
  return {
    density: stored?.density ?? "comfortable",
    columnOrder: stored?.columnOrder?.length ? stored.columnOrder : DEFAULT_COLUMN_ORDER,
    columnVisibility: { ...DEFAULT_COLUMN_VISIBILITY, ...stored?.columnVisibility },
    columnWidths: { ...DEFAULT_COLUMN_WIDTHS, ...stored?.columnWidths },
    sortField: stored?.sortField ?? "created_at",
    sortDirection: stored?.sortDirection ?? "desc",
    customViews: stored?.customViews ?? [],
  };
}

export function useCustomersListPreferences() {
  const [prefs, setPrefs] = useState<CustomerListPreferences>(() =>
    mergePreferences(readStorage()),
  );

  useEffect(() => {
    writeStorage(prefs);
  }, [prefs]);

  const setDensity = useCallback((density: CustomerListDensity) => {
    setPrefs((prev) => ({ ...prev, density }));
  }, []);

  const setSort = useCallback((sortField: CustomerSortField, sortDirection: SortDirection) => {
    setPrefs((prev) => ({ ...prev, sortField, sortDirection }));
  }, []);

  const toggleColumn = useCallback((columnId: CustomerColumnId) => {
    setPrefs((prev) => ({
      ...prev,
      columnVisibility: {
        ...prev.columnVisibility,
        [columnId]: !prev.columnVisibility[columnId],
      },
    }));
  }, []);

  const reorderColumns = useCallback((order: CustomerColumnId[]) => {
    setPrefs((prev) => ({ ...prev, columnOrder: order }));
  }, []);

  const setColumnWidth = useCallback((columnId: CustomerColumnId, width: number) => {
    setPrefs((prev) => ({
      ...prev,
      columnWidths: { ...prev.columnWidths, [columnId]: Math.max(72, width) },
    }));
  }, []);

  const addCustomView = useCallback((view: CustomSavedView) => {
    setPrefs((prev) => ({
      ...prev,
      customViews: [...prev.customViews.filter((v) => v.id !== view.id), view],
    }));
  }, []);

  const removeCustomView = useCallback((viewId: string) => {
    setPrefs((prev) => ({
      ...prev,
      customViews: prev.customViews.filter((v) => v.id !== viewId),
    }));
  }, []);

  return {
    prefs,
    setDensity,
    setSort,
    toggleColumn,
    reorderColumns,
    setColumnWidth,
    addCustomView,
    removeCustomView,
  };
}

export function useCustomerListFilterState() {
  const [filters, setFilters] = useState<CustomerListFilters>(createDefaultFilters);

  const resetFilters = useCallback(() => setFilters(createDefaultFilters()), []);

  const patchFilters = useCallback((patch: Partial<CustomerListFilters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
  }, []);

  return { filters, setFilters, patchFilters, resetFilters };
}
