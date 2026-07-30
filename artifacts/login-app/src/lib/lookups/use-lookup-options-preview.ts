import { useMemo } from "react";
import { useAuth } from "@/context/auth-context";
import { useQuery } from "@tanstack/react-query";
import { APP_QUERY_STALE_MS } from "@/lib/react-query/create-query-client";
import { fetchLookupOptions, lookupOptionsQueryKey } from "./lookup-options-service";
import { resolvePreviewFilters } from "./lookup-preview-utils";
import type { ListLookupConfig } from "./types";

export type LookupPreviewState = "ready" | "deferred";

export function useLookupOptionsPreview(
  config: ListLookupConfig | null,
  previewValues: Record<string, string> = {},
) {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;

  const previewResolution = useMemo(
    () => resolvePreviewFilters(config?.filters, previewValues),
    [config?.filters, previewValues],
  );

  const effectiveConfig = useMemo((): ListLookupConfig | null => {
    if (!config) return null;
    if (previewResolution.unresolvedKeys.length > 0) return null;
    return {
      ...config,
      filters: previewResolution.resolvedFilters,
    };
  }, [config, previewResolution.resolvedFilters, previewResolution.unresolvedKeys.length]);

  const previewState: LookupPreviewState =
    previewResolution.unresolvedKeys.length > 0 ? "deferred" : "ready";

  const query = useQuery({
    queryKey: [
      ...lookupOptionsQueryKey(companyId, effectiveConfig),
      "preview",
      previewValues,
    ],
    enabled: Boolean(companyId && effectiveConfig?.lookup && previewState === "ready"),
    staleTime: APP_QUERY_STALE_MS,
    queryFn: () => fetchLookupOptions(companyId!, effectiveConfig!),
  });

  return {
    ...query,
    previewState,
    unresolvedKeys: previewResolution.unresolvedKeys,
    hasTemplateTokens: previewResolution.hasTemplateTokens,
  };
}
