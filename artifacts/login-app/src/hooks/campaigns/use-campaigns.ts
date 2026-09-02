import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompanyPermissionAuth } from "@/hooks/billing/use-company-permission-auth";
import { useMarketingCampaignService } from "@/hooks/campaigns/use-marketing-campaign-service";
import type {
  CampaignAudienceDefinition,
  CampaignEligibilityPreviewResult,
  CreateCampaignDraftInput,
  MarketingCampaignChannel,
  MarketingCampaignStatus,
} from "@/lib/campaigns";
import { APP_QUERY_STALE_MS } from "@/lib/react-query/create-query-client";

export const CAMPAIGNS_QUERY_KEY = ["marketing-campaigns"] as const;

export function useCampaignsList(enabled: boolean, status?: MarketingCampaignStatus | null) {
  const { companyId, buildPortContext, isReady } = useCompanyPermissionAuth();
  const service = useMarketingCampaignService();

  return useQuery({
    queryKey: [...CAMPAIGNS_QUERY_KEY, companyId, status ?? "all"],
    enabled: Boolean(enabled && isReady && companyId),
    staleTime: APP_QUERY_STALE_MS,
    queryFn: async () => {
      const ctx = buildPortContext();
      return service.listCampaigns(ctx, { status: status ?? null });
    },
  });
}

export function useCampaignDetail(campaignId: string | null, enabled: boolean) {
  const { companyId, buildPortContext, isReady } = useCompanyPermissionAuth();
  const service = useMarketingCampaignService();

  return useQuery({
    queryKey: [...CAMPAIGNS_QUERY_KEY, "detail", companyId, campaignId],
    enabled: Boolean(enabled && isReady && companyId && campaignId),
    staleTime: APP_QUERY_STALE_MS,
    queryFn: async () => {
      const ctx = buildPortContext();
      const [campaign, recipients] = await Promise.all([
        service.getCampaign(ctx, campaignId!),
        service.listRecipients(ctx, campaignId!),
      ]);
      return { campaign, recipients };
    },
  });
}

export function useCampaignEligibilityPreview(
  audience: CampaignAudienceDefinition | null,
  channels: MarketingCampaignChannel[],
  enabled: boolean,
) {
  const { companyId, buildPortContext, isReady } = useCompanyPermissionAuth();
  const service = useMarketingCampaignService();

  return useQuery({
    queryKey: [
      ...CAMPAIGNS_QUERY_KEY,
      "eligibility",
      companyId,
      audience,
      [...channels].sort().join(","),
    ],
    enabled: Boolean(enabled && isReady && companyId && audience && channels.length > 0),
    staleTime: 15_000,
    queryFn: async (): Promise<CampaignEligibilityPreviewResult> => {
      const ctx = buildPortContext();
      return service.previewChannelEligibility(ctx, audience!, channels);
    },
  });
}

export function useCreateAndExecuteCampaign() {
  const qc = useQueryClient();
  const { buildPortContext } = useCompanyPermissionAuth();
  const service = useMarketingCampaignService();

  return useMutation({
    mutationFn: async (input: CreateCampaignDraftInput) => {
      const ctx = buildPortContext();
      const draft = await service.createDraft(ctx, input);
      // Resolve by the same durable idempotency key (not only draft.id) so concurrent
      // createDraft winners/losers always execute the same campaign row.
      const result = await service.execute(ctx, { idempotencyKey: input.idempotencyKey });
      return { draft, result };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CAMPAIGNS_QUERY_KEY });
    },
  });
}
