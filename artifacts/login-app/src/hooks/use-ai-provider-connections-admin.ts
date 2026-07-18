import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateAIProviderConnectionInput, UpdateAIProviderConnectionInput } from "@workspace/ai-provider-layer";
import { useAIProviderServices } from "@/lib/ai-provider-layer";

export function aiProviderConnectionsQueryKey(companyId: string | null) {
  return ["ai-provider-connections", companyId] as const;
}

export function aiProviderTypesQueryKey() {
  return ["ai-provider-types"] as const;
}

export function useAiProviderConnectionsAdmin(companyId: string | null) {
  const { services, context } = useAIProviderServices();

  return useQuery({
    queryKey: aiProviderConnectionsQueryKey(companyId),
    enabled: Boolean(companyId),
    staleTime: 30_000,
    queryFn: async () => {
      if (!companyId) return [];
      return services.registry.listConnections(context, { companyId });
    },
  });
}

export function useAiProviderTypes() {
  const { services, context } = useAIProviderServices();

  return useQuery({
    queryKey: aiProviderTypesQueryKey(),
    staleTime: 300_000,
    queryFn: () => services.registry.listProviderTypes(context),
  });
}

export function useAiProviderConnectionMutations(companyId: string | null) {
  const queryClient = useQueryClient();
  const { services, context } = useAIProviderServices();

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: aiProviderConnectionsQueryKey(companyId) });

  const invalidateRuntimeConfig = () =>
    queryClient.invalidateQueries({ queryKey: ["runtime-chat-config"] });

  const create = useMutation({
    mutationFn: (input: Omit<CreateAIProviderConnectionInput, "companyId">) => {
      if (!companyId) throw new Error("Company required");
      return services.registry.createConnection(context, { ...input, companyId });
    },
    onSuccess: () => {
      invalidate();
      invalidateRuntimeConfig();
    },
  });

  const update = useMutation({
    mutationFn: (input: UpdateAIProviderConnectionInput) =>
      services.registry.updateConnection(context, input),
    onSuccess: () => {
      invalidate();
      invalidateRuntimeConfig();
    },
  });

  const setDefault = useMutation({
    mutationFn: (connectionId: string) =>
      services.registry.updateConnection(context, {
        connectionId,
        isDefault: true,
        isEnabled: true,
        status: "active",
      }),
    onSuccess: () => {
      invalidate();
      invalidateRuntimeConfig();
    },
  });

  const disable = useMutation({
    mutationFn: (connectionId: string) => services.registry.disableConnection(context, connectionId),
    onSuccess: () => {
      invalidate();
      invalidateRuntimeConfig();
    },
  });

  return { create, update, setDefault, disable };
}
