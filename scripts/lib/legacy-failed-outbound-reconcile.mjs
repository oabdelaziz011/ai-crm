/**
 * Pure eligibility for legacy stuck outbound reconciliation.
 * Safe case only: pending/preparing message linked to a failed delivery event.
 */

/**
 * @param {{
 *   message: {
 *     id: string,
 *     message_type: string,
 *     status: string,
 *     metadata?: Record<string, unknown> | null,
 *   },
 *   conversation: { id: string, company_id: string },
 *   delivery: {
 *     id: string,
 *     company_id: string,
 *     conversation_id: string,
 *     outbound_message_id: string | null,
 *     delivery_status: string,
 *     failed_at?: string | null,
 *     error_message?: string | null,
 *     external_message_id?: string | null,
 *   },
 * }} input
 */
export function evaluateLegacyFailedOutboundReconcile(input) {
  const { message, conversation, delivery } = input;

  if (!message?.id || !conversation?.company_id || !delivery?.id) {
    return { eligible: false, reason: "missing_required_rows" };
  }

  if (message.message_type !== "outgoing") {
    return { eligible: false, reason: "not_outgoing" };
  }

  if (["sent", "delivered", "read"].includes(message.status)) {
    return { eligible: false, reason: "successful_message_protected" };
  }

  if (delivery.outbound_message_id !== message.id) {
    return { eligible: false, reason: "outbound_message_id_mismatch" };
  }

  if (delivery.conversation_id !== conversation.id) {
    return { eligible: false, reason: "conversation_mismatch" };
  }

  if (delivery.company_id !== conversation.company_id) {
    return { eligible: false, reason: "company_mismatch" };
  }

  if (delivery.delivery_status !== "failed") {
    return { eligible: false, reason: "delivery_not_failed" };
  }

  const hasFailureEvidence = Boolean(delivery.failed_at) || Boolean(String(delivery.error_message ?? "").trim());
  if (!hasFailureEvidence) {
    return { eligible: false, reason: "no_failure_evidence" };
  }

  const phase = message.metadata?.outboundPhase;
  const stuckPending =
    message.status === "pending"
    || phase === "preparing"
    || phase === "dispatching";

  if (!stuckPending) {
    if (message.status === "failed" || message.metadata?.dispatchFailed === true) {
      return { eligible: false, reason: "already_failed_idempotent" };
    }
    return { eligible: false, reason: "not_stuck_pending_preparing" };
  }

  return {
    eligible: true,
    reason: "deterministic_failed_delivery",
    confirmStatus: "failed",
    externalMessageId: null,
  };
}
