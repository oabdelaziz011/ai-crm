/**
 * Saved report views + schedule drafts (client persistence).
 * Server tables in migration 277 sync later; local storage works offline-first.
 */
import type { ReportsWorkspaceFilters } from "@/lib/reports/reports-filters";

const VIEWS_KEY = "valueor_report_saved_views_v1";
const SCHEDULES_KEY = "valueor_report_schedules_v1";

export type SavedReportView = {
  id: string;
  name: string;
  companyId: string;
  userId: string;
  filters: ReportsWorkspaceFilters;
  updatedAt: string;
};

export type ReportScheduleDraft = {
  id: string;
  name: string;
  companyId: string;
  userId: string;
  reportId: string;
  branchId: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  /** daily | weekly | monthly */
  frequency: "daily" | "weekly" | "monthly";
  email: string;
  enabled: boolean;
  createdAt: string;
};

function readJson<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as T[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeJson<T>(key: string, rows: T[]): void {
  localStorage.setItem(key, JSON.stringify(rows));
}

export function listSavedReportViews(companyId: string, userId: string): SavedReportView[] {
  return readJson<SavedReportView>(VIEWS_KEY).filter(
    (v) => v.companyId === companyId && v.userId === userId,
  );
}

export function saveReportView(input: Omit<SavedReportView, "id" | "updatedAt"> & { id?: string }): SavedReportView {
  const rows = readJson<SavedReportView>(VIEWS_KEY);
  const row: SavedReportView = {
    id: input.id ?? (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `view-${Date.now()}`),
    name: input.name,
    companyId: input.companyId,
    userId: input.userId,
    filters: input.filters,
    updatedAt: new Date().toISOString(),
  };
  const next = [...rows.filter((r) => r.id !== row.id), row];
  writeJson(VIEWS_KEY, next);
  return row;
}

export function deleteSavedReportView(id: string): void {
  writeJson(
    VIEWS_KEY,
    readJson<SavedReportView>(VIEWS_KEY).filter((r) => r.id !== id),
  );
}

export function listReportSchedules(companyId: string, userId: string): ReportScheduleDraft[] {
  return readJson<ReportScheduleDraft>(SCHEDULES_KEY).filter(
    (s) => s.companyId === companyId && s.userId === userId,
  );
}

export function saveReportSchedule(
  input: Omit<ReportScheduleDraft, "id" | "createdAt"> & { id?: string },
): ReportScheduleDraft {
  const rows = readJson<ReportScheduleDraft>(SCHEDULES_KEY);
  const row: ReportScheduleDraft = {
    id: input.id ?? (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `sch-${Date.now()}`),
    name: input.name,
    companyId: input.companyId,
    userId: input.userId,
    reportId: input.reportId,
    branchId: input.branchId,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    frequency: input.frequency,
    email: input.email,
    enabled: input.enabled,
    createdAt: new Date().toISOString(),
  };
  writeJson(SCHEDULES_KEY, [...rows.filter((r) => r.id !== row.id), row]);
  return row;
}

export function deleteReportSchedule(id: string): void {
  writeJson(
    SCHEDULES_KEY,
    readJson<ReportScheduleDraft>(SCHEDULES_KEY).filter((r) => r.id !== id),
  );
}
