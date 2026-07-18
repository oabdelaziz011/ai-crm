import { useQuery } from "@tanstack/react-query";
import { fetchWorkspaceBillingSummaryV1 } from "@/lib/workspace/workspace-billing-summary";

export const WORKSPACE_BILLING_SUMMARY_KEY = ["workspace", "billing", "summary", "v1"] as const;

export function useWorkspaceBillingSummary(enabled = true) {
  return useQuery({
    queryKey: WORKSPACE_BILLING_SUMMARY_KEY,
    enabled,
    queryFn: fetchWorkspaceBillingSummaryV1,
  });
}
