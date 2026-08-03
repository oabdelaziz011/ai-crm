import { useMemo, useState } from "react";

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

import { useAuthUser } from "@/hooks/use-rbac";
import { createLoginAppApplicationPorts } from "@/lib/application-layer/create-login-app-application-ports";

import { mapBookingReadModelToRow } from "@/lib/application-layer/operations-queue-row-mapper";

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



  const bookings = await ports.bookingRead.listQueue(input.companyId, {

    search: query.search,

  });



  const allRows = bookings.map((booking) => mapBookingReadModelToRow(booking, config));

  return queueDataEngine.paginate(allRows, { ...query, companyId: input.companyId });

}



export function useUniversalOperationsConfig(templateKey = "clinic") {

  const { company } = useAuth();

  const { hasPermission, isSuperAdmin, user } = useAuthUser();

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

      const model = await ports.operationsWorkspaceRead.getConfig(company.id, templateKey);

      return (model?.config ?? {}) as OperationsWorkspaceConfig;

    },

    enabled: Boolean(company?.id && user?.id),

    staleTime: 60_000,

  });

}



export function useUniversalOperationsQueue(templateKey = "clinic") {

  const { user, company } = useAuth();

  const { hasPermission, isSuperAdmin } = useAuthUser();

  const configQuery = useUniversalOperationsConfig(templateKey);



  useUniversalOperationsRealtime(company?.id ?? null);



  const [query, setQuery] = useState<OperationsQueueQuery>({

    companyId: company?.id ?? "",

    page: 1,

    pageSize: 50,

    search: "",

    sort: [{ columnId: "col_scheduled", direction: "asc" }],

    filters: {},

  });

  const [preferences, setPreferences] = useState<OperationsGridPreferences>(DEFAULT_PREFERENCES);



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

  };

}

