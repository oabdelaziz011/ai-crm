import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  clearPendingCheckoutSession,
  createSaasCheckoutSession,
  fetchBillingCheckoutSession,
  readPendingCheckoutSession,
  storePendingCheckoutSession,
  type SaasCheckoutCreateResponse,
} from "@/lib/billing/saas-checkout-api";
import { WORKSPACE_BILLING_SUMMARY_KEY } from "@/hooks/workspace/use-workspace-billing-summary";
import { COMPANY_SUBSCRIPTIONS_KEY } from "@/hooks/billing/use-company-subscriptions";

export function useCreateSaasCheckout() {
  return useMutation({
    mutationFn: async (input: {
      returnUrl: string;
      cancelUrl?: string;
      idempotencyKey: string;
      expectedAmount: number;
      expectedCurrency: string;
    }): Promise<SaasCheckoutCreateResponse> => {
      const result = await createSaasCheckoutSession({
        returnUrl: input.returnUrl,
        cancelUrl: input.cancelUrl,
        idempotencyKey: input.idempotencyKey,
      });

      const amount = Number(result.amount);
      if (!Number.isFinite(amount) || Math.abs(amount - input.expectedAmount) > 0.009) {
        throw new Error("CHECKOUT_AMOUNT_MISMATCH");
      }
      if (
        input.expectedCurrency &&
        result.currency &&
        result.currency.toLowerCase() !== input.expectedCurrency.toLowerCase()
      ) {
        throw new Error("CHECKOUT_CURRENCY_MISMATCH");
      }
      if (!result.checkoutUrl) {
        throw new Error("CHECKOUT_URL_MISSING");
      }

      storePendingCheckoutSession(String(result.sessionId));
      return result;
    },
  });
}

export function useSaasCheckoutReturnSession(enabled: boolean) {
  const sessionId = typeof window !== "undefined" ? readPendingCheckoutSession() : null;
  const qc = useQueryClient();

  return useQuery({
    queryKey: ["billing", "saas-checkout-session", sessionId],
    enabled: enabled && Boolean(sessionId),
    queryFn: async () => {
      if (!sessionId) return null;
      const row = await fetchBillingCheckoutSession(sessionId);
      if (row?.settled_at || row?.status === "succeeded" || row?.status === "failed") {
        void qc.invalidateQueries({ queryKey: WORKSPACE_BILLING_SUMMARY_KEY });
        void qc.invalidateQueries({ queryKey: COMPANY_SUBSCRIPTIONS_KEY });
        void qc.invalidateQueries({ queryKey: ["billing", "invoices"] });
        void qc.invalidateQueries({ queryKey: ["billing", "payments"] });
        void qc.invalidateQueries({ queryKey: ["billing", "receipts"] });
      }
      if (row?.settled_at && row.billing_payment_id) {
        clearPendingCheckoutSession();
      }
      return row;
    },
    // Bounded refetch while processing — not continuous aggressive polling
    refetchInterval: (query) => {
      const row = query.state.data;
      if (!row) return 4000;
      if (row.settled_at || row.status === "failed" || row.status === "canceled" || row.status === "expired") {
        return false;
      }
      if (row.status === "succeeded" && !row.billing_payment_id) return 3000;
      if (row.status === "pending" || row.status === "created") return 4000;
      return false;
    },
    refetchIntervalInBackground: false,
  });
}
