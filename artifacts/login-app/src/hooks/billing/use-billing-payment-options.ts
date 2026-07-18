import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  type BillingPaymentOptions,
  isMissingBillingPaymentOptionsRpcError,
} from "@/lib/billing/settings-runtime";

export class BillingPaymentOptionsError extends Error {
  readonly code: "migration_missing" | "no_methods" | "rpc_error";

  constructor(code: BillingPaymentOptionsError["code"], message: string) {
    super(message);
    this.name = "BillingPaymentOptionsError";
    this.code = code;
  }
}

export function useBillingPaymentOptions(companyId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["billing", "payment-options", companyId],
    enabled: enabled && Boolean(companyId),
    queryFn: async (): Promise<BillingPaymentOptions> => {
      const { data, error } = await supabase.rpc("get_billing_payment_options_v1", {
        p_company_id: companyId,
      });
      if (error) {
        if (isMissingBillingPaymentOptionsRpcError(error.message)) {
          throw new BillingPaymentOptionsError(
            "migration_missing",
            "Billing migration 104 is not applied. Payment methods require get_billing_payment_options_v1.",
          );
        }
        throw new BillingPaymentOptionsError("rpc_error", error.message);
      }

      const options = data as BillingPaymentOptions;
      if (!options?.payment_methods?.length) {
        throw new BillingPaymentOptionsError(
          "no_methods",
          "No supported payment methods are configured for this company.",
        );
      }

      return options;
    },
  });
}
