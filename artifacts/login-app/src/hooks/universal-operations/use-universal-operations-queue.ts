import { useMemo, useState, useEffect, useCallback } from "react";

import { useQuery } from "@tanstack/react-query";

import type {

  OperationsGridPreferences,

  OperationsQueuePage,

  OperationsQueueQuery,

  OperationsRow,

  OperationsSortState,

} from "@workspace/universal-operations-engine";

import {

  metadataEngine,

  queueDataEngine,

} from "@workspace/universal-operations-engine";

import type { OperationsWorkspaceConfig } from "@workspace/universal-operations-engine";

import { useAuth } from "@/context/auth-context";
import { supabase } from "@/lib/supabase";

import { useCompanyPermissionAuth } from "@/hooks/billing/use-company-permission-auth";
import { createLoginAppApplicationPorts } from "@/lib/application-layer/create-login-app-application-ports";
import {
  createOperationsConfigCommandContext,
  ensureOperationsWorkspaceSeed,
} from "@/lib/application-layer/operations-workspace-config-service";

import { mapBookingReadModelToRow } from "@/lib/application-layer/operations-queue-row-mapper";
import { resolveQueueTimezone } from "@/lib/scheduling/operations/utilities/calendar-day-range";
import {
  resolveQueueDateRange,
  type QueueDatePreset,
} from "@/lib/universal-operations/operations-queue-date-range";
import {
  assignPeopleAhead,
  assignQueueNumbers,
  operationsQueueKey,
  queueDayKey,
} from "@/lib/universal-operations/operations-queue-people-ahead";

import { useUniversalOperationsRealtime } from "./use-universal-operations-realtime";



const BOOKING_ORDER_SORT: OperationsSortState[] = [{ columnId: "col_queue_number", direction: "asc" }];

/** Tenant configs seeded before booking-priority ordering still persist this default. */
function isLegacyScheduledDefaultSort(sort: OperationsSortState[]): boolean {
  return sort.length === 1 && sort[0]?.columnId === "col_scheduled" && sort[0]?.direction === "asc";
}

const DEFAULT_PREFERENCES: OperationsGridPreferences = {

  columnWidths: {},

  columnOrder: [],

  pinnedColumns: {},

  hiddenColumnIds: [],

  density: "comfortable",

};



/** Loads every booking in range with filters/search/sort applied; paging happens client-side. */
async function loadLiveOperationsQueueRows(

  templateKey: string,

  query: Omit<OperationsQueueQuery, "page" | "pageSize">,

  input: {

    companyId: string;

    actorUserId: string;

    isSuperAdmin: boolean;

    hasPermission: (code: string) => boolean;

    timezone: string;

  },

): Promise<OperationsRow[]> {

  const ports = createLoginAppApplicationPorts({

    companyId: input.companyId,

    actorUserId: input.actorUserId,

    isSuperAdmin: input.isSuperAdmin,

    hasPermission: input.hasPermission,

  });

  const workspaceModel = await ports.operationsWorkspaceRead.getConfig(input.companyId, templateKey);
  const config = (workspaceModel?.config ?? {}) as OperationsWorkspaceConfig;



  const filters = query.filters ?? {};
  const timezone = resolveQueueTimezone(
    typeof filters.timezone === "string" ? filters.timezone : null,
    input.timezone,
  );
  const dateFrom =
    typeof filters.dateFrom === "string" && filters.dateFrom.trim()
      ? filters.dateFrom.trim().slice(0, 10)
      : undefined;
  const dateTo =
    typeof filters.dateTo === "string" && filters.dateTo.trim()
      ? filters.dateTo.trim().slice(0, 10)
      : dateFrom;

  const bookings = await ports.bookingRead.listQueue(input.companyId, {
    timezone,
    ...(dateFrom ? { dateFrom, dateTo: dateTo ?? dateFrom } : {}),
  });



  const queueKeyById = new Map(
    bookings.map((booking) => [
      booking.id,
      operationsQueueKey(
        booking.tenantId || input.companyId,
        booking.serviceId || booking.serviceName || "",
        queueDayKey(booking.scheduledAt, timezone),
      ),
    ]),
  );
  const keyOf = (row: OperationsRow) => queueKeyById.get(row.id) ?? "";
  const prepared = assignQueueNumbers(
    assignPeopleAhead(
      bookings.map((booking) => mapBookingReadModelToRow(booking, config)),
      keyOf,
    ),
    keyOf,
  );
  const queueNumberById = new Map(prepared.map((row) => [row.id, row.values.queue_number]));
  const peopleAheadById = new Map(prepared.map((row) => [row.id, row.values.people_ahead]));

  const ranked = queueDataEngine.paginate(prepared, {
    ...query,
    companyId: input.companyId,
    page: 1,
    pageSize: Math.max(1, prepared.length),
  }).rows;
  return ranked.map((row) => ({
    ...row,
    values: {
      ...row.values,
      queue_number: queueNumberById.get(row.id) ?? null,
      people_ahead: peopleAheadById.get(row.id) ?? null,
    },
  }));

}



export function useUniversalOperationsConfig(templateKey = "clinic") {

  const { company } = useAuth();

  const { hasCompanyPermission: hasPermission, isSuperAdmin, user } = useCompanyPermissionAuth();

  return useQuery({

    queryKey: ["universal-operations", "config", company?.id, templateKey],

    queryFn: async () => {

      if (!company?.id || !user?.id) throw new Error("Not authenticated");

      const ports = createLoginAppApplicationPorts({

        companyId: company.id,

        actorUserId: user.id,

        isSuperAdmin,

        hasPermission,

      });

      const cmd = createOperationsConfigCommandContext({
        companyId: company.id,
        actorUserId: user.id,
        isSuperAdmin,
        hasPermission,
      });
      await ensureOperationsWorkspaceSeed(cmd, templateKey);

      const model = await ports.operationsWorkspaceRead.getConfig(company.id, templateKey);

      return (model?.config ?? {}) as OperationsWorkspaceConfig;

    },

    enabled: Boolean(company?.id && user?.id),

    staleTime: 60_000,

  });

}



export function useUniversalOperationsQueue(templateKey = "clinic") {
  const { user, company, profile } = useAuth();
  const { hasCompanyPermission: hasPermission, isSuperAdmin } = useCompanyPermissionAuth();
  const configQuery = useUniversalOperationsConfig(templateKey);

  useUniversalOperationsRealtime(company?.id ?? null);

  const bookingTimezoneQuery = useQuery({
    queryKey: ["scheduling-booking-rules", "timezone", company?.id],
    enabled: Boolean(company?.id),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scheduling_booking_rules")
        .select("timezone")
        .eq("company_id", company!.id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data?.timezone ? String(data.timezone) : null;
    },
  });
  const companyTimezone = bookingTimezoneQuery.data
    ? resolveQueueTimezone(bookingTimezoneQuery.data)
    : null;
  const queueTimezone = companyTimezone ?? resolveQueueTimezone(profile?.timezone ?? null);
  const initialToday = resolveQueueDateRange("today", null, null, queueTimezone);

  const [query, setQuery] = useState<OperationsQueueQuery>({
    companyId: company?.id ?? "",
    page: 1,
    pageSize: 50,
    search: "",
    sort: BOOKING_ORDER_SORT,
    filters: {
      datePreset: initialToday.datePreset,
      dateFrom: initialToday.dateFrom,
      dateTo: initialToday.dateTo,
      timezone: queueTimezone,
    },
  });

  const [preferences, setPreferencesState] = useState<OperationsGridPreferences>(DEFAULT_PREFERENCES);

  useEffect(() => {
    const config = configQuery.data;
    if (!config) return;
    const grid = config.views?.gridPreferences;
    if (grid) {
      setPreferencesState({
        columnWidths: grid.columnWidths ?? {},
        columnOrder: grid.columnOrder ?? [],
        pinnedColumns: grid.pinnedColumns ?? {},
        hiddenColumnIds: grid.hiddenColumnIds ?? [],
        density: grid.density ?? "comfortable",
      });
    }
    const queueRules = config.queueRules;
    if (queueRules) {
      setQuery((q) => ({
        ...q,
        pageSize: queueRules.pageSize ?? q.pageSize,
        sort:
          queueRules.defaultSort?.length && !isLegacyScheduledDefaultSort(queueRules.defaultSort)
            ? queueRules.defaultSort
            : q.sort,
        filters: { ...queueRules.defaultFilters, ...q.filters },
      }));
    }
  }, [configQuery.data]);

  const persistGridPreferences = useCallback(
    async (next: OperationsGridPreferences) => {
      if (!company?.id || !user?.id || !configQuery.data) return;
      const cmd = createOperationsConfigCommandContext({
        companyId: company.id,
        actorUserId: user.id,
        isSuperAdmin,
        hasPermission,
      });
      const { saveOperationsConfigurationDraft } = await import("@/lib/application-layer/operations-workspace-config-service");
      await saveOperationsConfigurationDraft(cmd, templateKey, {
        ...configQuery.data,
        views: {
          ...configQuery.data.views,
          savedViews: configQuery.data.views?.savedViews ?? [],
          gridPreferences: {
            columnOrder: next.columnOrder,
            hiddenColumnIds: next.hiddenColumnIds,
            columnWidths: next.columnWidths,
            pinnedColumns: next.pinnedColumns,
            density: next.density,
          },
        },
      });
    },
    [company?.id, user?.id, configQuery.data, templateKey, isSuperAdmin, hasPermission],
  );

  const setPreferences = useCallback(
    (value: OperationsGridPreferences | ((prev: OperationsGridPreferences) => OperationsGridPreferences)) => {
      setPreferencesState((prev) => {
        const next = typeof value === "function" ? value(prev) : value;
        void persistGridPreferences(next);
        return next;
      });
    },
    [persistGridPreferences],
  );



  const calendarQuery = useMemo<OperationsQueueQuery>(() => {
    const preset = (String(query.filters?.datePreset ?? "today") as QueueDatePreset) || "today";
    if (!companyTimezone || preset === "custom") {
      return {
        ...query,
        filters: { ...(query.filters ?? {}), timezone: queueTimezone },
      };
    }
    const range = resolveQueueDateRange(preset, null, null, companyTimezone);
    return {
      ...query,
      filters: { ...(query.filters ?? {}), ...range, timezone: companyTimezone },
    };
  }, [companyTimezone, query, queueTimezone]);

  const canLoadLive = Boolean(
    company?.id && user?.id && configQuery.data && bookingTimezoneQuery.isFetched,
  );



  const { page: requestedPage, pageSize, ...listQuery } = calendarQuery;

  const dataQuery = useQuery({

    queryKey: ["universal-operations", "queue", templateKey, company?.id, listQuery, preferences],

    enabled: canLoadLive,

    queryFn: () =>

      loadLiveOperationsQueueRows(templateKey, { ...listQuery, companyId: company!.id }, {

        companyId: company!.id,

        actorUserId: user!.id,

        isSuperAdmin,

        hasPermission,

        timezone: queueTimezone,

      }),

    staleTime: 15_000,

  });



  const columns = useMemo(() => {

    if (!configQuery.data) return [];

    return metadataEngine.visibleColumns(configQuery.data, preferences);

  }, [configQuery.data, preferences]);



  const filteredRows = dataQuery.data;
  const total = filteredRows?.length ?? 0;
  /** A single-day filter shows that whole day on one page. */
  const showsWholeDay = Boolean(listQuery.filters?.dateFrom) && listQuery.filters?.dateFrom === listQuery.filters?.dateTo;
  const visiblePageSize = showsWholeDay ? Math.max(1, total) : pageSize;
  const totalPages = Math.max(1, Math.ceil(total / visiblePageSize));
  const currentPage = Math.min(Math.max(1, requestedPage), totalPages);

  const page = useMemo<OperationsQueuePage | undefined>(() => {
    if (!filteredRows) return undefined;
    const start = (currentPage - 1) * visiblePageSize;
    return {
      rows: filteredRows.slice(start, start + visiblePageSize),
      total,
      page: currentPage,
      pageSize: visiblePageSize,
      hasMore: start + visiblePageSize < total,
    };
  }, [currentPage, filteredRows, visiblePageSize, total]);

  const updateSearch = (search: string) => setQuery((q) => ({ ...q, search, page: 1 }));

  const updateSort = (sort: OperationsSortState[]) => setQuery((q) => ({ ...q, sort, page: 1 }));

  const setPage = useCallback(
    (next: number) => setQuery((q) => ({ ...q, page: Math.min(Math.max(1, next), totalPages) })),
    [totalPages],
  );

  const setPageSize = useCallback(
    (nextSize: number) =>
      setQuery((q) => {
        const firstRowIndex = (Math.min(q.page, totalPages) - 1) * q.pageSize;
        return { ...q, pageSize: nextSize, page: Math.floor(firstRowIndex / nextSize) + 1 };
      }),
    [totalPages],
  );



  return {

    config: configQuery.data,

    configLoading: configQuery.isLoading,

    columns,

    preferences,

    setPreferences,

    query: calendarQuery,

    setQuery,

    updateSearch,

    updateSort,

    setPage,

    setPageSize,

    totalPages,

    showsWholeDay,

    filteredRows: filteredRows ?? [],

    page,

    loading: dataQuery.isLoading,

    isFetching: dataQuery.isFetching,

    refetch: dataQuery.refetch,

  };

}

