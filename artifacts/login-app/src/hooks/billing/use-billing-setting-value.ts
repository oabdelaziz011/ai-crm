import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { parseBillingSettingString } from "@/lib/billing/parse-billing-setting";

export { parseBillingSettingString } from "@/lib/billing/parse-billing-setting";

export function useBillingSettingValue(code: string, companyId: string | null = null, enabled = true) {
  return useQuery({
    queryKey: ["billing", "setting", code, companyId],
    enabled,
    queryFn: async (): Promise<unknown> => {
      const { data, error } = await supabase.rpc("get_billing_setting", {
        p_code: code,
        p_company_id: companyId,
      });
      if (error) throw new Error(error.message);
      return data;
    },
  });
}
