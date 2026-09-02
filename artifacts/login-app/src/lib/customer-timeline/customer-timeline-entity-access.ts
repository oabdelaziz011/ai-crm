import {
  CustomerNotFoundInTenantError,
  TimelineEntityAccessError,
} from "@workspace/activity-timeline";
import type { TimelineEntityAccessPort } from "@workspace/activity-timeline";
import { supabase } from "@/lib/supabase";

export const customerTimelineEntityAccess: TimelineEntityAccessPort = {
  async assertEntityAccess(_ctx, scope) {
    if (scope.entityType !== "customer") {
      throw new TimelineEntityAccessError("Unsupported timeline entity type.");
    }

    if (!scope.companyId?.trim() || !scope.entityId?.trim()) {
      throw new CustomerNotFoundInTenantError();
    }

    const { data, error } = await supabase
      .from("customers")
      .select("id, company_id")
      .eq("id", scope.entityId)
      .eq("company_id", scope.companyId)
      .maybeSingle();

    if (error) {
      throw new TimelineEntityAccessError(error.message);
    }
    if (!data) {
      throw new CustomerNotFoundInTenantError();
    }
  },
};
