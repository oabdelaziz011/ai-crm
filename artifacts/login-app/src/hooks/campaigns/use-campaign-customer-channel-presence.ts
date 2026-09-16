import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useCompanyPermissionAuth } from "@/hooks/billing/use-company-permission-auth";
import {
  buildMessagingPresence,
  type CampaignMessagingPresence,
} from "@/lib/campaigns/campaign-customer-channel-availability";
import { APP_QUERY_STALE_MS } from "@/lib/react-query/create-query-client";

const EMPTY_PRESENCE: CampaignMessagingPresence = new Map();

/**
 * Company-scoped Instagram/Messenger conversation presence for campaign picker checks.
 * Does not invent identities; only existing conversations count.
 */
export function useCampaignCustomerChannelPresence(enabled: boolean) {
  const { companyId, isReady } = useCompanyPermissionAuth();

  return useQuery({
    queryKey: ["campaign-customer-channel-presence", companyId],
    enabled: Boolean(enabled && isReady && companyId),
    staleTime: APP_QUERY_STALE_MS,
    queryFn: async (): Promise<CampaignMessagingPresence> => {
      if (!companyId) return EMPTY_PRESENCE;
      const { data, error } = await supabase
        .from("conversations")
        .select("customer_id, channel_type")
        .eq("company_id", companyId)
        .in("channel_type", ["instagram", "messenger"])
        .is("deleted_at", null)
        .not("customer_id", "is", null);
      if (error) throw new Error(error.message);
      return buildMessagingPresence(data ?? []);
    },
  });
}
