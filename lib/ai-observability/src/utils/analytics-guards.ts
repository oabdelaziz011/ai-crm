import { AnalyticsFeatureDisabledError } from "../errors.js";
import type { ServiceContext } from "../types.js";

export function assertAnalyticsFeatureEnabled(ctx: ServiceContext): void {
  if (ctx.isSuperAdmin) return;
  if (ctx.isAnalyticsFeatureEnabled && !ctx.isAnalyticsFeatureEnabled()) {
    throw new AnalyticsFeatureDisabledError();
  }
}
