import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import { webChatCompanyChannelQueryKey } from "@/hooks/ai-chat/use-web-chat-company-channel";
import { useChannelRegistryServices } from "@/lib/channel-registry";
import { resolveChannelCommercialFeatureCode } from "@/lib/billing/feature-code-map";
import { requireCompanyFeature } from "@/lib/billing/require-company-feature";
import { supabase } from "@/lib/supabase";
import type {
  CreateCompanyChannelInput,
  UpdateCompanyChannelConfigurationInput,
} from "@workspace/channel-registry";

export function companyChannelsQueryKey(companyId: string | null) {
  return ["company-channels", companyId] as const;
}

export function channelTypesQueryKey() {
  return ["communication-channel-types"] as const;
}

export function useCompanyChannelsAdmin(enabled = true) {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const { services, context } = useChannelRegistryServices();

  return useQuery({
    queryKey: companyChannelsQueryKey(companyId),
    enabled: Boolean(enabled && companyId),
    staleTime: 30_000,
    queryFn: async () => {
      if (!companyId) return [];
      return services.companyChannels.listCompanyChannels(context, { companyId });
    },
  });
}

export function useCommunicationChannelTypes() {
  const { services, context } = useChannelRegistryServices();

  return useQuery({
    queryKey: channelTypesQueryKey(),
    staleTime: 300_000,
    queryFn: () => services.registry.listChannelTypes(context),
  });
}

async function assertChannelFeatureForType(
  companyId: string,
  channelTypeKey: string | null | undefined,
): Promise<void> {
  const featureCode = resolveChannelCommercialFeatureCode(channelTypeKey);
  if (!featureCode) return;
  await requireCompanyFeature(supabase, companyId, featureCode);
}

export function useChannelAdminMutations(companyId: string | null) {
  const queryClient = useQueryClient();
  const { services, context } = useChannelRegistryServices();

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: companyChannelsQueryKey(companyId) });
    void queryClient.invalidateQueries({ queryKey: webChatCompanyChannelQueryKey(companyId) });
  };

  const create = useMutation({
    mutationFn: async (
      input: Omit<CreateCompanyChannelInput, "companyId"> & { channelTypeKey?: string },
    ) => {
      if (!companyId) throw new Error("Company required");
      await assertChannelFeatureForType(companyId, input.channelTypeKey);
      const { channelTypeKey: _channelTypeKey, ...createInput } = input;
      return services.companyChannels.createConnection(context, { ...createInput, companyId });
    },
    onSuccess: invalidate,
  });

  const updateConfig = useMutation({
    mutationFn: async (
      input: UpdateCompanyChannelConfigurationInput & { channelTypeKey?: string },
    ) => {
      if (!companyId) throw new Error("Company required");
      await assertChannelFeatureForType(companyId, input.channelTypeKey);
      const { channelTypeKey: _channelTypeKey, ...updateInput } = input;
      return services.companyChannels.updateConfiguration(context, updateInput);
    },
    onSuccess: invalidate,
  });

  const enable = useMutation({
    mutationFn: async (input: { companyChannelId: string; channelTypeKey?: string }) => {
      if (!companyId) throw new Error("Company required");
      await assertChannelFeatureForType(companyId, input.channelTypeKey);
      return services.companyChannels.enable(context, input.companyChannelId);
    },
    onSuccess: invalidate,
  });

  const disable = useMutation({
    mutationFn: async (input: { companyChannelId: string; channelTypeKey?: string }) => {
      if (!companyId) throw new Error("Company required");
      return services.companyChannels.disable(context, input.companyChannelId);
    },
    onSuccess: invalidate,
  });

  const setDefault = useMutation({
    mutationFn: async (input: { companyChannelId: string; channelTypeKey?: string }) => {
      if (!companyId) throw new Error("Company required");
      await assertChannelFeatureForType(companyId, input.channelTypeKey);
      return services.companyChannels.setDefaultChannel(context, companyId, input.companyChannelId);
    },
    onSuccess: invalidate,
  });

  return { create, updateConfig, enable, disable, setDefault };
}
