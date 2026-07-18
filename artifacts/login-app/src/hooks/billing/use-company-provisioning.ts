import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useBillingContact } from "@/hooks/billing/use-billing-contact";
import { useCompanySubscription } from "@/hooks/billing/use-company-subscriptions";
import {
  evaluateCompanyProvisioning,
  type CompanyProvisioningResult,
} from "@/lib/billing/company-provisioning";

export function useCompanyProvisioning(companyId: string | null, enabled = true) {
  const active = enabled && Boolean(companyId);

  const companyQuery = useQuery({
    queryKey: ["billing", "company-exists", companyId],
    enabled: active,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase.from("companies").select("id").eq("id", companyId!).maybeSingle();
      if (error) throw new Error(error.message);
      return Boolean(data);
    },
  });

  const { data: subscription, isLoading: subscriptionLoading, error: subscriptionError } = useCompanySubscription(
    companyId,
    active,
  );
  const { data: billingContact, isLoading: contactLoading, error: contactError } = useBillingContact(
    companyId,
    active,
  );

  const isLoading = companyQuery.isLoading || subscriptionLoading || contactLoading;
  const error = companyQuery.error ?? subscriptionError ?? contactError;

  const provisioning: CompanyProvisioningResult | undefined =
    !isLoading && !error
      ? evaluateCompanyProvisioning({
          companyExists: companyQuery.data ?? false,
          subscription,
          billingContact,
        })
      : undefined;

  return {
    provisioning,
    isLoading,
    error: error instanceof Error ? error : error ? new Error(String(error)) : null,
    companyExists: companyQuery.data ?? false,
    subscription,
    billingContact,
  };
}
