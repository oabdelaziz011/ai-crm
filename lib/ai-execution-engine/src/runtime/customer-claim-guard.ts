/**
 * Replaces unsupported success claims using this turn's tool outputs.
 * Mentions that are not success assertions are left unchanged.
 */

export type ClaimToolExecution = {
  toolKey: string;
  status: string;
  output: Record<string, unknown> | null;
};

export type ClaimGuardResult = {
  text: string;
  adjusted: boolean;
};

const NEGATED = /(?:\bnot\b|\bnever\b|\bhasn't\b|\bhas not\b|\bdid not\b|\bwasn't\b|لم يتم|لم يُ|لم ن|مش|ليس)/i;

function outputOf(executions: readonly ClaimToolExecution[], toolKey: string): Record<string, unknown> | null {
  const match = [...executions].reverse().find((row) => row.toolKey === toolKey && row.status !== "failed");
  return match?.output ?? null;
}

function flag(output: Record<string, unknown> | null, key: string): boolean {
  return output?.[key] === true;
}

export function verifiedClaimFacts(executions: readonly ClaimToolExecution[]) {
  const quoteStatus = outputOf(executions, "get_quote_delivery_status");
  const quoteRequest = outputOf(executions, "request_send_quote");
  const quoteDraft = outputOf(executions, "create_draft_quote");
  const demo = outputOf(executions, "create_demo_booking");
  const handoff = outputOf(executions, "escalate_to_human");
  const quoteSent =
    flag(quoteStatus, "sent") ||
    (quoteRequest?.sent === true && quoteRequest.deliveryState === "sent");
  const demoBooked = demo?.success === true && typeof demo.bookingId === "string" && demo.bookingId.length > 0;
  const handoffOwner =
    handoff?.ownership && typeof handoff.ownership === "object"
      ? (handoff.ownership as { ownerType?: unknown }).ownerType
      : null;
  const handoffSucceeded =
    flag(handoff, "assigned") ||
    flag(handoff, "queued") ||
    flag(demo, "handoffSucceeded") ||
    handoffOwner === "human_agent" ||
    handoffOwner === "queue";
  const paymentReceived = executions.some((row) => row.output?.paymentCreated === true);
  const purchaseCompleted = executions.some((row) => row.output?.orderCreated === true);
  return { quoteSent, demoBooked, handoffSucceeded, paymentReceived, purchaseCompleted, quoteDraft: quoteDraft?.success === true };
}

function claims(sentence: string, pattern: RegExp): boolean {
  if (NEGATED.test(sentence)) return false;
  return pattern.test(sentence);
}

const QUOTE_SENT = /(?:تم إرسال عرض السعر|quote (?:has been|was) sent|i(?:'ve| have) sent (?:the |your )?quote)/i;
const PAYMENT = /(?:تم استلام الدفع|تم الدفع|payment (?:has been|was) received)/i;
const PURCHASE = /(?:تم الشراء|purchase (?:is|was) complete|order (?:has been|was) (?:placed|completed))/i;
const DEMO = /(?:تم حجز عرض المنتج|demo (?:is|has been) booked|your demo is confirmed)/i;
const HANDOFF = /(?:تم تحويلك|human (?:representative|colleague) (?:has taken over|will continue)|handed (?:you|the conversation) to a human)/i;

export function reconcileUnverifiedCustomerClaims(
  text: string,
  executions: readonly ClaimToolExecution[],
): ClaimGuardResult {
  const facts = verifiedClaimFacts(executions);
  const sentences = text.split(/(?<=[.!?؟])\s+/);
  let adjusted = false;
  const next = sentences.map((sentence) => {
    if (claims(sentence, QUOTE_SENT) && !facts.quoteSent) {
      adjusted = true;
      return facts.quoteDraft
        ? "A quote draft was prepared for the team. It has not been sent."
        : "I could not confirm that a quote was sent.";
    }
    if (claims(sentence, PAYMENT) && !facts.paymentReceived) {
      adjusted = true;
      return "I could not confirm that a payment was received.";
    }
    if (claims(sentence, PURCHASE) && !facts.purchaseCompleted) {
      adjusted = true;
      return "I could not confirm that a purchase was completed.";
    }
    if (claims(sentence, DEMO) && !facts.demoBooked) {
      adjusted = true;
      return "I could not confirm that a demo was booked.";
    }
    if (claims(sentence, HANDOFF) && !facts.handoffSucceeded) {
      adjusted = true;
      return "I could not confirm that a human teammate has taken this conversation.";
    }
    return sentence;
  });
  const reconciled = next.join(" ");
  const scrubbed = scrubInternalCatalogWording(reconciled);
  return { text: scrubbed.text, adjusted: adjusted || scrubbed.adjusted };
}

/** Hide internal catalog status tokens. Ordinary "not listed" feature sentences stay. */
export function scrubInternalCatalogWording(text: string): { text: string; adjusted: boolean } {
  let adjusted = false;
  const next = text
    .replace(/\bnot_listed\b/gi, () => {
      adjusted = true;
      return "not confirmed";
    })
    .replace(/price(?:\s+is|:)\s+not listed/gi, () => {
      adjusted = true;
      return "price is not confirmed";
    });
  return { text: next, adjusted };
}
