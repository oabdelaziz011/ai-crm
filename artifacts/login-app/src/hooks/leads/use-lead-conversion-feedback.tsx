import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import {
  describeLeadConversionOutcome,
  type LeadConversionUiMode,
  type LeadConversionUiOutcome,
} from "@/components/leads/crm/lead-conversion-outcome";
import { customerWorkspaceDashboardHref } from "@/lib/customer-workspace/customer-workspace-utils";

/**
 * After a successful Lead conversion: toast the outcome with an "Open customer" action and
 * open the linked opportunity (Opportunity360) when there is one.
 */
export function useLeadConversionFeedback(input: { onOpenOpportunity: (opportunityId: string) => void }) {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { onOpenOpportunity } = input;

  return useCallback(
    (outcome: LeadConversionUiOutcome, mode: LeadConversionUiMode) => {
      const { title, description } = describeLeadConversionOutcome(t, outcome, mode);
      const customerId = outcome.customerId;
      const openCustomerLabel = t("leads.convert.openCustomer");
      toast({
        title,
        description,
        action: customerId ? (
          <ToastAction
            altText={openCustomerLabel}
            onClick={() => setLocation(customerWorkspaceDashboardHref(customerId))}
          >
            {openCustomerLabel}
          </ToastAction>
        ) : undefined,
      });
      if (outcome.opportunityId) onOpenOpportunity(outcome.opportunityId);
    },
    [onOpenOpportunity, setLocation, t, toast],
  );
}
