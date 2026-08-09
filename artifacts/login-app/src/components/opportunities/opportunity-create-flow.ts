export type OpportunityCreateFlowView = "closed" | "checking" | "gate" | "form";

export type OpportunityCreateExistingCheckStatus =
  | "idle"
  | "loading"
  | "success"
  | "error";

/**
 * Owns Create Opportunity UI phases so CASE B (existing opportunity)
 * never transitions through the create form.
 */
export function resolveOpportunityCreateFlowView(input: {
  open: boolean;
  isFromLead: boolean;
  existingCheckStatus: OpportunityCreateExistingCheckStatus;
  hasExisting: boolean;
  forceCreate: boolean;
}): OpportunityCreateFlowView {
  if (!input.open) return "closed";
  if (!input.isFromLead) return "form";
  if (
    input.existingCheckStatus === "loading" ||
    input.existingCheckStatus === "idle"
  ) {
    return "checking";
  }
  if (input.hasExisting && !input.forceCreate) return "gate";
  return "form";
}
