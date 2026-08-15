/**
 * Detects when a WhatsApp customer is asking for a structured booking/scheduling flow.
 * Used to force AI → automation transfer when a transferable flow is configured.
 */
export function isBookingTransferIntent(text: string | null | undefined): boolean {
  const value = typeof text === "string" ? text.trim() : "";
  if (!value) return false;
  return /حجز|احجز|موعد|مواعيد|عياد|دكتور|طبيب|أسنان|اسنان|appointment|book(ing)?|schedule|doctor|clinic/i.test(
    value,
  );
}

export const BOOKING_TOOLS_DISABLED_WHEN_TRANSFERABLE = [
  // Kept for reference / tests — booking tools stay enabled so the employee can
  // take real actions; transfer_to_workflow is additive when a flow is linked.
] as const;

export function buildTransferableFlowSystemPromptAddon(flowId: string): string {
  return [
    "CRITICAL WORKFLOW TRANSFER RULES:",
    `- This employee is linked to automation flow ${flowId}.`,
    "- For multi-step booking lists (doctor/date/time pickers), call transfer_to_workflow immediately.",
    "- You may still use real booking tools for direct availability checks or create_booking when the customer already gave exact details.",
    "- Never invent or confirm a booking yourself.",
    "- Never say a booking was created unless create_booking or transfer_to_workflow returned success.",
    "- After transfer_to_workflow succeeds, reply using customerFacingMessage from the tool result.",
  ].join("\n");
}

export function buildBookingActionSystemPromptAddon(): string {
  return [
    "CRITICAL BOOKING ACTION RULES:",
    "- You may only confirm a booking after create_booking returns success=true with a bookingId.",
    "- Before offering times, call search_availability or find_next_available.",
    "- If a tool returns success=false, booking_conflict, or slot_unavailable: tell the customer the slot is already booked/unavailable and offer another slot. Never invent availability.",
    "- Never say تم الحجز / booked / confirmed unless a tool actually succeeded.",
  ].join("\n");
}
