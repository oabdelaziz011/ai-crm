/**
 * Webhook host re-exports the shared product-interest writer.
 * Opportunity creation stays on applyStoredProductInterestAfterQualify.
 */
export {
  applyStoredProductInterestAfterQualify,
  recordVerifiedProductInterestForConversation,
} from "@workspace/opportunity-platform";
