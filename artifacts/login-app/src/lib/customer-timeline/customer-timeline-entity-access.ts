import { TimelineEntityAccessError } from "@workspace/activity-timeline";
import type { TimelineEntityAccessPort } from "@workspace/activity-timeline";
import { supabase } from "@/lib/supabase";

export const customerTimelineEntityAccess: TimelineEntityAccessPort = {
  async assertEntityAccess(_ctx, scope) {
    if (scope.entityType !== "customer") {
      throw new TimelineEntityAccessError("Unsupported timeline entity type.");
    }

    const { data, error } = await supabase
      .from("customers")
      .select("id")
      .eq("id", scope.entityId)
      .eq("company_id", scope.companyId)
      .maybeSingle();

    if (error || !data) {
      throw new TimelineEntityAccessError("Customer not found in tenant.");
    }
  },
};
