import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@/context/auth-context";
import { supabase } from "@/lib/supabase";
import { customersListKey } from "@/hooks/use-customers";
import { CRM_LIST_MAX_ROWS } from "@/lib/crm/crm-list-config";
import { APP_QUERY_STALE_MS } from "@/lib/react-query/create-query-client";
import { fetchLookupOptions, lookupOptionsQueryKey } from "./lookup-options-service";
import type { ListLookupConfig } from "./types";

export function useLookupOptions(config: ListLookupConfig | null) {
  const { profile } = useUser();
  const queryClient = useQueryClient();
  const companyId = profile?.company_id ?? null;

  return useQuery({
    queryKey: lookupOptionsQueryKey(companyId, config),
    enabled: Boolean(companyId && config?.lookup),
    staleTime: APP_QUERY_STALE_MS,
    queryFn: () => {
      if (config?.lookup === "customers" && companyId) {
        const cachedCustomers = queryClient.getQueryData<unknown[]>([
          ...customersListKey(companyId),
          "bounded",
          CRM_LIST_MAX_ROWS,
        ]);
        if (cachedCustomers?.length) {
          return fetchLookupOptions(companyId, config, supabase, {
            customers: cachedCustomers as Record<string, unknown>[],
          });
        }
      }
      return fetchLookupOptions(companyId!, config!);
    },
  });
}
