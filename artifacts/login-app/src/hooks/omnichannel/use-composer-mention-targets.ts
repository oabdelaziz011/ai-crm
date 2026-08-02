import { useQuery } from "@tanstack/react-query";
import {
  filterMentionTargets,
  listComposerMentionTargets,
} from "@/lib/omnichannel/services/composer-mention-service";

export function useComposerMentionTargets(companyId: string | null, query: string | null) {
  const targetsQuery = useQuery({
    queryKey: ["composer-mention-targets", companyId],
    enabled: Boolean(companyId),
    staleTime: 60_000,
    queryFn: () => listComposerMentionTargets(companyId!),
  });

  const filtered = filterMentionTargets(targetsQuery.data ?? [], query);

  return {
    targets: filtered,
    allTargets: targetsQuery.data ?? [],
    isLoading: targetsQuery.isLoading,
    error: targetsQuery.error,
  };
}
