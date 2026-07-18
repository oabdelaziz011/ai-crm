import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { COMPANY_SUBSCRIPTIONS_KEY } from "@/hooks/billing/use-company-subscriptions";

export function useRecordSubscriptionPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      companyId: string;
      amount: number;
      currency?: string;
      paymentMethodCode: string;
      paymentMethodLabel?: string;
    }) => {
      const { data, error } = await supabase.rpc("renew_subscription_from_payment", {
        p_company_id: input.companyId,
        p_amount: input.amount,
        p_currency: input.currency ?? null,
        p_payment_method_label: input.paymentMethodLabel ?? null,
        p_payment_method_code: input.paymentMethodCode,
      });
      if (error) throw new Error(error.message);
      return data as Record<string, unknown>;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: COMPANY_SUBSCRIPTIONS_KEY });
      qc.invalidateQueries({ queryKey: [...COMPANY_SUBSCRIPTIONS_KEY, variables.companyId] });
      qc.invalidateQueries({ queryKey: ["billing", "subscription-events"] });
      qc.invalidateQueries({ queryKey: ["billing", "audit-log"] });
      qc.invalidateQueries({ queryKey: ["billing", "invoices", variables.companyId] });
      qc.invalidateQueries({ queryKey: ["billing", "payments", variables.companyId] });
      qc.invalidateQueries({ queryKey: ["billing", "receipts", variables.companyId] });
      qc.invalidateQueries({ queryKey: ["notifications", "list", variables.companyId] });
    },
  });
}
