import type { SupabaseClient } from "@supabase/supabase-js";
import type { BusinessCalendarPort } from "@workspace/automation-platform";
import { getBusinessCalendarService } from "@/lib/scheduling/business-calendar";
import type { DatePickerConstraintOptions } from "@/lib/scheduling/business-calendar/types";

export function createBusinessCalendarPort(client?: SupabaseClient): BusinessCalendarPort {
  const service = getBusinessCalendarService(client);
  return {
    async getDatePickerConstraints(companyId, config: DatePickerConstraintOptions) {
      return service.getDatePickerConstraints({
        companyId,
        ...config,
      });
    },
  };
}
