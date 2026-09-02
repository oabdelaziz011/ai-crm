import { DeliveryFailedError } from "../errors.js";
import type { ChannelCommercialEntitlementPort } from "../ports/channel-commercial-entitlement-port.js";
import {
  isSellableChannelKey,
  resolveChannelCommercialFeatureCode,
} from "../ports/channel-commercial-entitlement-port.js";

export class ChannelCommercialNotEntitledError extends Error {
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
    this.name = "ChannelCommercialNotEntitledError";
    this.companyId = input.companyId;
    this.channelKey = input.channelKey;
    this.featureCode = input.featureCode;
  }
}

function denialMessage(
  channelKey: string,
  reason: string,
): string {
  if (reason === "not_entitled") {
    return `${channelKey} channel is not entitled.`;
  }
  if (reason === "entitlement_unavailable") {
    return `${channelKey} commercial access unavailable.`;
  }
  return `${channelKey} commercial entitlement check failed.`;
}

/** Inbound/webhook gate — throws when sellable channel is not entitled. */
export async function assertInboundChannelCommercialAccess(
  port: ChannelCommercialEntitlementPort | undefined,
  input: { companyId: string; channelKey: string },
): Promise<void> {
  if (!input.companyId?.trim()) {
    throw new ChannelCommercialNotEntitledError({
      companyId: input.companyId ?? "",
      channelKey: input.channelKey,
      featureCode: resolveChannelCommercialFeatureCode(input.channelKey),
      message: "Company context required for channel commercial gate.",
    });
  }

  if (!isSellableChannelKey(input.channelKey)) {
    return;
  }

  if (!port) {
    throw new ChannelCommercialNotEntitledError({
      companyId: input.companyId,
      channelKey: input.channelKey,
      featureCode: resolveChannelCommercialFeatureCode(input.channelKey),
      message: "Channel commercial entitlement port unavailable.",
    });
  }

  const access = await port.checkAccess(input);
  if (!access.allowed) {
    throw new ChannelCommercialNotEntitledError({
      companyId: input.companyId,
      channelKey: input.channelKey,
      featureCode: access.featureCode,
      message: denialMessage(input.channelKey, access.reason),
    });
  }
}

/** Outbound pipeline gate — throws DeliveryFailedError when not entitled. */
export async function assertOutboundChannelCommercialAccess(
  port: ChannelCommercialEntitlementPort | undefined,
  input: { companyId: string; channelKey: string },
): Promise<void> {
  if (!input.companyId?.trim()) {
    throw new DeliveryFailedError("Company context required for outbound commercial gate.");
  }

  if (!isSellableChannelKey(input.channelKey)) {
    return;
  }

  if (!port) {
    throw new DeliveryFailedError(
      `${input.channelKey} commercial access unavailable.`,
    );
  }

  const access = await port.checkAccess(input);
  if (!access.allowed) {
    throw new DeliveryFailedError(denialMessage(input.channelKey, access.reason));
  }
}
