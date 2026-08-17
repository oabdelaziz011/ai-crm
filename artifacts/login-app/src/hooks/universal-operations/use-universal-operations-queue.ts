import { useMemo, useState, useEffect, useCallback } from "react";

import { useQuery } from "@tanstack/react-query";

import type {

  OperationsGridPreferences,

  OperationsQueuePage,

  OperationsQueueQuery,

  OperationsSortState,

} from "@workspace/universal-operations-engine";

import {

  metadataEngine,

  queueDataEngine,

} from "@workspace/universal-operations-engine";

import type { OperationsWorkspaceConfig } from "@workspace/universal-operations-engine";

import { useAuth } from "@/context/auth-context";

import { useCompanyPermissionAuth } from "@/hooks/billing/use-company-permission-auth";
import { createLoginAppApplicationPorts } from "@/lib/application-layer/create-login-app-application-ports";
import {
  createOperationsConfigCommandContext,
  ensureOperationsWorkspaceSeed,
} from "@/lib/application-layer/operations-workspace-config-service";

import { mapBookingReadModelToRow } from "@/lib/application-layer/operations-queue-row-mapper";
import { resolveQueueTimezone } from "@/lib/scheduling/operations/utilities/calendar-day-range";
import { resolveQueueDateRange } from "@/lib/universal-operations/operations-queue-date-range";

import { useUniversalOperationsRealtime } from "./use-universal-operations-realtime";



const DEFAULT_PREFERENCES: OperationsGridPreferences = {

  columnWidths: {},

  columnOrder: [],

  pinnedColumns: {},

  hiddenColumnIds: [],

  density: "comfortable",

};



async function loadLiveOperationsQueuePage(

  templateKey: string,

  query: OperationsQueueQuery,

  input: {

    companyId: string;

    actorUserId: string;

    isSuperAdmin: boolean;

    hasPermission: (code: string) => boolean;

    timezone: string;

  },

): Promise<OperationsQueuePage> {

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
    search: query.search,
    timezone,
    ...(dateFrom ? { dateFrom, dateTo: dateTo ?? dateFrom } : {}),
  });



  const allRows = bookings.map((booking) => mapBookingReadModelToRow(booking, config));

  return queueDataEngine.paginate(allRows, { ...query, companyId: input.companyId });

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

  const queueTimezone = resolveQueueTimezone(profile?.timezone ?? null);
  const initialToday = resolveQueueDateRange("today", null, null, queueTimezone);

  const [query, setQuery] = useState<OperationsQueueQuery>({
    companyId: company?.id ?? "",
    page: 1,
    pageSize: 50,
    search: "",
    sort: [{ columnId: "col_scheduled", direction: "asc" }],
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
        sort: queueRules.defaultSort?.length ? queueRules.defaultSort : q.sort,
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



  const canLoadLive = Boolean(company?.id && user?.id && configQuery.data);



  const dataQuery = useQuery({

    queryKey: ["universal-operations", "queue", templateKey, company?.id, query, preferences],

    enabled: canLoadLive,

    queryFn: () =>

      loadLiveOperationsQueuePage(templateKey, { ...query, companyId: company!.id }, {

        companyId: company!.id,

        actorUserId: user!.id,

        isSuperAdmin,

        hasPermission,

        timezone: resolveQueueTimezone(
          typeof query.filters?.timezone === "string" ? query.filters.timezone : null,
          queueTimezone,
        ),

      }),

    staleTime: 15_000,

  });



  const columns = useMemo(() => {

    if (!configQuery.data) return [];

    return metadataEngine.visibleColumns(configQuery.data, preferences);

  }, [configQuery.data, preferences]);



  const updateSearch = (search: string) => setQuery((q) => ({ ...q, search, page: 1 }));

  const updateSort = (sort: OperationsSortState[]) => setQuery((q) => ({ ...q, sort }));

  const loadMore = () => setQuery((q) => ({ ...q, page: q.page + 1 }));



  return {

    config: configQuery.data,

    configLoading: configQuery.isLoading,

    columns,

    preferences,

    setPreferences,

    query,

    setQuery,

    updateSearch,

    updateSort,

    loadMore,

    page: dataQuery.data,

    loading: dataQuery.isLoading,

    isFetching: dataQuery.isFetching,

    refetch: dataQuery.refetch,

  };

}

