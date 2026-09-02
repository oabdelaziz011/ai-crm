import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveChannelCommercialFeatureCode } from "../../billing/feature-code-map.ts";
import {
  FeatureNotEntitledError,
  requireCompanyFeature,
} from "../../billing/require-company-feature.ts";

/**
 * Non-sellable CommunicationDispatcher channels — no commercial transport SKU.
 * Matches B1.1: non-sellable keys skip the commercial gate.
 */
const NON_SELLABLE_COMMUNICATION_CHANNELS = new Set([
  "push",
  "in_app",
  "webhook",
]);

export class CommunicationChannelCommercialError extends Error {
  readonly code = "CHANNEL_NOT_ENTITLED";
  readonly companyId: string;
  readonly channelKey: string;
  readonly featureCode: string | null;

  constructor(input: {
    companyId: string;
    channelKey: string;
    featureCode: string | null;
    message?: string;
  }) {
    super(
      input.message ??
        `Channel "${input.channelKey}" is not commercially entitled for this company.`,
    );
    this.name = "CommunicationChannelCommercialError";
    this.companyId = input.companyId;
    this.channelKey = input.channelKey;
    this.featureCode = input.featureCode;
  }
}

export type CommunicationChannelCommercialDecision =
  | { action: "allow"; reason: "non_sellable" | "entitled" }
  | {
      action: "deny";
      reason:
        | "missing_company"
        | "missing_channel"
        | "unknown_channel"
        | "not_entitled"
        | "entitlement_error";
      featureCode: string | null;
    };

/**
 * Pure fail-closed decision for CommunicationDispatcher channel commercial gate.
 * Does not treat omnichannel as a transport entitlement.
 * Does not infer entitlement from destination phone/email.
 */
export function decideCommunicationChannelCommercialAccess(input: {
  companyId: string | null | undefined;
  channelKey: string | null | undefined;
  /** true = entitled, false = not entitled, undefined = loading/unavailable */
  isFeatureEntitled?: (featureCode: string) => boolean | undefined;
}): CommunicationChannelCommercialDecision {
  const companyId = input.companyId?.trim() ?? "";
  if (!companyId) {
    return { action: "deny", reason: "missing_company", featureCode: null };
  }

  const channelKey = input.channelKey?.trim().toLowerCase() ?? "";
  if (!channelKey) {
    return { action: "deny", reason: "missing_channel", featureCode: null };
  }

  const featureCode = resolveChannelCommercialFeatureCode(channelKey);
  if (!featureCode) {
    if (NON_SELLABLE_COMMUNICATION_CHANNELS.has(channelKey)) {
      return { action: "allow", reason: "non_sellable" };
    }
    return { action: "deny", reason: "unknown_channel", featureCode: null };
  }

  if (!input.isFeatureEntitled) {
    return { action: "deny", reason: "entitlement_error", featureCode };
  }

  const entitled = input.isFeatureEntitled(featureCode);
  if (entitled === true) {
    return { action: "allow", reason: "entitled" };
  }
  if (entitled === false) {
    return { action: "deny", reason: "not_entitled", featureCode };
  }
  return { action: "deny", reason: "entitlement_error", featureCode };
}

export type AssertCommunicationChannelCommercialAccess = (
  companyId: string,
  channelKey: string,
) => Promise<void>;

/**
 * Fail-closed commercial assertion before CommunicationDispatcher provider enqueue/dispatch.
 * Reuses requireCompanyFeature (billing SoT). Does not bypass for SYSTEM_CONTEXT/service-role.
 */
export function createAssertCommunicationChannelCommercialAccess(
  client: SupabaseClient,
): AssertCommunicationChannelCommercialAccess {
  return async (companyId, channelKey) => {
    const company = companyId?.trim() ?? "";
    const channel = channelKey?.trim().toLowerCase() ?? "";

    if (!company) {
      throw new CommunicationChannelCommercialError({
        companyId: company,
        channelKey: channel,
        featureCode: null,
        message: "Company context required for communication commercial gate.",
      });
    }
    if (!channel) {
      throw new CommunicationChannelCommercialError({
        companyId: company,
        channelKey: channel,
        featureCode: null,
        message: "Channel context required for communication commercial gate.",
      });
    }

    const featureCode = resolveChannelCommercialFeatureCode(channel);
    if (!featureCode) {
      if (NON_SELLABLE_COMMUNICATION_CHANNELS.has(channel)) {
        return;
      }
      throw new CommunicationChannelCommercialError({
        companyId: company,
        channelKey: channel,
        featureCode: null,
        message: `Unknown channel "${channel}" is not commercially entitled.`,
      });
    }

    try {
      await requireCompanyFeature(client, company, featureCode);
    } catch (error) {
      if (error instanceof FeatureNotEntitledError) {
        throw new CommunicationChannelCommercialError({
          companyId: company,
          channelKey: channel,
          featureCode: error.featureCode,
          message: error.message,
        });
      }
      throw new CommunicationChannelCommercialError({
        companyId: company,
        channelKey: channel,
        featureCode,
        message: `${channel} commercial entitlement check failed.`,
      });
    }
  };
}
