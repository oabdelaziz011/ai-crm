import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import { useChannelRegistryServices } from "@/lib/channel-registry";
import type { CreateCompanyChannelInput, UpdateCompanyChannelConfigurationInput } from "@workspace/channel-registry";

export function companyChannelsQueryKey(companyId: string | null) {
  return ["company-channels", companyId] as const;
}

export function channelTypesQueryKey() {
  return ["communication-channel-types"] as const;
}

export function useCompanyChannelsAdmin() {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const { services, context } = useChannelRegistryServices();

  return useQuery({
    queryKey: companyChannelsQueryKey(companyId),
    enabled: Boolean(companyId),
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

export function useChannelAdminMutations(companyId: string | null) {
  const queryClient = useQueryClient();
  const { services, context } = useChannelRegistryServices();

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: companyChannelsQueryKey(companyId) });

  const create = useMutation({
    mutationFn: (input: Omit<CreateCompanyChannelInput, "companyId">) => {
      if (!companyId) throw new Error("Company required");
      return services.companyChannels.createConnection(context, { ...input, companyId });
    },
    onSuccess: invalidate,
  });

  const updateConfig = useMutation({
    mutationFn: (input: UpdateCompanyChannelConfigurationInput) =>
      services.companyChannels.updateConfiguration(context, input),
    onSuccess: invalidate,
  });

  const enable = useMutation({
    mutationFn: (companyChannelId: string) =>
      services.companyChannels.enable(context, companyChannelId),
    onSuccess: invalidate,
  });

  const disable = useMutation({
    mutationFn: (companyChannelId: string) =>
      services.companyChannels.disable(context, companyChannelId),
    onSuccess: invalidate,
  });

  const setDefault = useMutation({
    mutationFn: (companyChannelId: string) => {
      if (!companyId) throw new Error("Company required");
      return services.companyChannels.setDefaultChannel(context, companyId, companyChannelId);
    },
    onSuccess: invalidate,
  });

  return { create, updateConfig, enable, disable, setDefault };
}
