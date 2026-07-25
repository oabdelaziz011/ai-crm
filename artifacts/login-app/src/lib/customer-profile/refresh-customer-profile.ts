import type { QueryClient } from "@tanstack/react-query";
import { customerKey } from "@/hooks/use-customer";
import {
  customerProfileMetricsKey,
  customerTimelineKey,
} from "@/hooks/use-customer-timeline";

export function refreshCustomerProfileCache(
  queryClient: QueryClient,
  customerId: string,
  companyId?: string | null,
): void {
  void queryClient.invalidateQueries({ queryKey: customerKey(customerId) });
  void queryClient.invalidateQueries({
    queryKey: customerTimelineKey(customerId, companyId),
  });
  void queryClient.invalidateQueries({
    queryKey: customerProfileMetricsKey(customerId, companyId),
  });
}
