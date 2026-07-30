import { AgentsFeatureDisabledError } from "../errors.js";
import type { ServiceContext } from "../types.js";

export function assertAgentsFeatureEnabled(ctx: ServiceContext): void {
  if (ctx.isSuperAdmin) return;
  if (ctx.isAgentsFeatureEnabled && !ctx.isAgentsFeatureEnabled()) {
    throw new AgentsFeatureDisabledError();
  }
}
