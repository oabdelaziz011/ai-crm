import { supabase } from "@/lib/supabase";
import { customerTimelineService } from "./timeline-service";
import type { CustomerProfileMetrics, TimelineFetchInput } from "./types";

export async function fetchCustomerProfileMetrics(
  input: TimelineFetchInput,
): Promise<CustomerProfileMetrics> {
  const [bookingsResult, invoicesResult, timeline] = await Promise.all([
    supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", input.customerId),
    supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", input.customerId),
    customerTimelineService.getTimeline(input),
  ]);

  return {
    bookingsCount: bookingsResult.count ?? 0,
    invoicesCount: invoicesResult.count ?? 0,
    lastInteractionAt: timeline[0]?.occurredAt ?? null,
  };
}
