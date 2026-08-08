import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import { companyWorkspaceBundleKey } from "@/lib/company-workspace/query-keys";
import { loadCompanyWorkspaceBundle } from "@/lib/company-workspace/services/company-workspace-bundle-service";
import { APP_QUERY_STALE_MS } from "@/lib/react-query/create-query-client";

export { companyWorkspaceBundleKey };

export function useCompanyWorkspaceBundle(enabled = true) {
  const { company } = useAuth();
  const companyId = company?.id ?? "";

  return useQuery({
    queryKey: companyWorkspaceBundleKey(companyId),
    enabled: Boolean(enabled && companyId),
    staleTime: APP_QUERY_STALE_MS,
    queryFn: () => loadCompanyWorkspaceBundle(companyId),
  });
}
