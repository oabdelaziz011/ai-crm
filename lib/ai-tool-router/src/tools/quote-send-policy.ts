/**
 * AI quote send mode.
 * Human approval is the only mode unless a host passes an explicit persisted
 * policy value AND a server-side quotes.send authorization flag.
 * There is no company settings column for direct send today. Do not infer one.
 */
export const AI_QUOTE_SEND_POLICY_VERSION = 1 as const;

export type AiQuoteSendMode = "human_approval" | "direct_send";

export type ResolvedAiQuoteSendPolicy = {
  version: typeof AI_QUOTE_SEND_POLICY_VERSION;
  mode: AiQuoteSendMode;
  reason:
    | "no_persisted_direct_send_policy"
    | "human_approval_default"
    | "direct_send_denied_missing_quotes_send"
    | "explicit_policy_and_quotes_send";
};

export function resolveAiQuoteSendPolicy(input: {
  /** Only the literal persisted value "direct_send" can leave the default. */
  persistedMode?: string | null;
  /** True only after the server verified quotes.send for this company. Never from model text. */
  serverAuthorizedQuoteSend?: boolean;
}): ResolvedAiQuoteSendPolicy {
  if (input.persistedMode === "direct_send") {
    if (input.serverAuthorizedQuoteSend === true) {
      return {
        version: AI_QUOTE_SEND_POLICY_VERSION,
        mode: "direct_send",
        reason: "explicit_policy_and_quotes_send",
      };
    }
    return {
      version: AI_QUOTE_SEND_POLICY_VERSION,
      mode: "human_approval",
      reason: "direct_send_denied_missing_quotes_send",
    };
  }
  return {
    version: AI_QUOTE_SEND_POLICY_VERSION,
    mode: "human_approval",
    reason: input.persistedMode == null || input.persistedMode === ""
      ? "no_persisted_direct_send_policy"
      : "human_approval_default",
  };
}
