import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { APP_QUERY_STALE_MS } from "@/lib/react-query/create-query-client";
import {
  emailRoutingConfigRepository,
} from "@/lib/email-routing/email-routing-config-repository";
import type { EmailRoutingCategoryDraft } from "@/lib/email-routing/types";

export function emailRoutingConfigKey(companyId: string | null) {
  return ["email-routing-config", companyId] as const;
}

export function useEmailRoutingConfig(companyId: string | null, enabled = true) {
  return useQuery({
    queryKey: emailRoutingConfigKey(companyId),
    enabled: Boolean(companyId) && enabled,
    staleTime: APP_QUERY_STALE_MS,
    queryFn: () => emailRoutingConfigRepository.getMyConfig(),
  });
}

export function useUpsertEmailRoutingConfig(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (categories: EmailRoutingCategoryDraft[]) =>
      emailRoutingConfigRepository.upsertMyConfig(categories),
    onSuccess: (data) => {
      void qc.setQueryData(emailRoutingConfigKey(companyId), data);
      void qc.invalidateQueries({ queryKey: emailRoutingConfigKey(companyId) });
    },
  });
}
