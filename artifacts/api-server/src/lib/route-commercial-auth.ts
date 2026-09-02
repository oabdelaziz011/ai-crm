import { HttpError } from "../middleware/error-handler.js";
import {
  FeatureNotEntitledError,
  requireCompanyFeature,
  resolveChannelCommercialFeatureCode,
} from "./require-company-feature.js";

export async function assertRouteCommercialFeature(
  companyId: string,
  featureCode: string,
): Promise<void> {
  const scopedCompanyId = companyId?.trim();
  if (!scopedCompanyId) {
    throw new HttpError(403, "No company context.", "forbidden");
  }
  const scopedFeatureCode = featureCode?.trim();
  if (!scopedFeatureCode) {
    throw new HttpError(403, "Commercial feature code is required.", "FEATURE_NOT_ENTITLED");
  }

  try {
    await requireCompanyFeature(scopedCompanyId, scopedFeatureCode);
  } catch (error) {
    if (error instanceof FeatureNotEntitledError) {
      throw new HttpError(403, error.message, "FEATURE_NOT_ENTITLED");
    }
    throw new HttpError(403, "Commercial entitlement check failed.", "FEATURE_NOT_ENTITLED");
  }
}

export async function assertRouteChannelCommercialFeature(
  companyId: string,
  channelKey: string,
): Promise<void> {
  const featureCode = resolveChannelCommercialFeatureCode(channelKey);
  if (!featureCode) {
    throw new HttpError(403, "Channel is not commercially entitled.", "FEATURE_NOT_ENTITLED");
  }
  await assertRouteCommercialFeature(companyId, featureCode);
}
