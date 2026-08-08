import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { getSchedulingServices } from "@/lib/scheduling";
import type { PricingRuleFormValues } from "@/lib/scheduling/validation/service-schemas";
import {
  schedulingPricingRuleTypesKey,
  schedulingServiceKey,
  schedulingServicePricingRulesKey,
  schedulingServicesKey,
} from "@/hooks/scheduling/keys";

const services = getSchedulingServices();

async function requireUserId(): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user.id;
}

export function usePricingRuleTypes(companyId: string | null) {
  return useQuery({
    queryKey: schedulingPricingRuleTypesKey(companyId),
    enabled: Boolean(companyId),
    queryFn: () => services.servicePricing.listTypes(companyId!),
    staleTime: 60_000,
  });
}

export function useServicePricingRules(companyId: string | null, serviceId: string | null) {
  return useQuery({
    queryKey: schedulingServicePricingRulesKey(companyId, serviceId),
    enabled: Boolean(companyId && serviceId),
    queryFn: () => services.servicePricing.listRules(companyId!, serviceId!),
  });
}

export function useSaveServicePricingRules(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      serviceId,
      rules,
    }: {
      serviceId: string;
      rules: PricingRuleFormValues[];
    }) => {
      if (!companyId) throw new Error("Company required");
      const userId = await requireUserId();
      return services.servicePricing.saveRules(companyId, serviceId, userId, rules);
    },
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({
        queryKey: schedulingServicePricingRulesKey(companyId, variables.serviceId),
      });
      void qc.invalidateQueries({ queryKey: schedulingServicesKey(companyId) });
      void qc.invalidateQueries({
        queryKey: schedulingServiceKey(companyId, variables.serviceId),
      });
    },
  });
}
