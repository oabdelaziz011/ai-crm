import type { SupabaseClient } from "@supabase/supabase-js";
import type { FeatureFlagReadPort } from "@workspace/application-layer";
import {
  featureFlagEngine,
  type FeatureFlagResolutionContext,
  type FeatureFlagRow,
} from "@workspace/configuration-platform";
import type { LoginAppPortContext } from "./customer-read-port-adapter.js";

class FeatureFlagReadError extends Error {
  readonly name = "FeatureFlagReadError";
}

function denyOnReadFailure(featureKey: string) {
  return Object.freeze({
    featureKey,
    enabled: false,
    source: "default" as const,
  });
}

type FeatureFlagDbRow = {
  feature_key: string;
  scope_type: string;
  scope_id: string | null;
  enabled: boolean;
  rollout_percentage: number;
  environment: string;
  activates_at: string | null;
  expires_at: string | null;
  prerequisites: string[] | null;
  priority: number;
};

function mapRow(row: FeatureFlagDbRow): FeatureFlagRow {
  return Object.freeze({
    featureKey: String(row.feature_key),
    scopeType: row.scope_type as FeatureFlagRow["scopeType"],
    scopeId: row.scope_id,
    enabled: Boolean(row.enabled),
    rolloutPercentage: Number(row.rollout_percentage),
    environment: row.environment as FeatureFlagRow["environment"],
    activatesAt: row.activates_at,
    expiresAt: row.expires_at,
    prerequisites: Object.freeze(Array.isArray(row.prerequisites) ? row.prerequisites : []),
    priority: Number(row.priority),
  });
}

function canRead(ctx: LoginAppPortContext): boolean {
  if (ctx.isSuperAdmin) return true;
  return ctx.hasPermission("feature_flags.read") || ctx.hasPermission("configuration.read");
}

function buildScopeFilter(tenantId: string, context: FeatureFlagResolutionContext): string {
  const parts = ["scope_type.eq.global", `and(scope_type.eq.company,scope_id.eq.${tenantId})`];
  if (context.planId) {
    parts.push(`and(scope_type.eq.plan,scope_id.eq.${context.planId})`);
  }
  if (context.branchId) {
    parts.push(`and(scope_type.eq.branch,scope_id.eq.${context.branchId})`);
  }
  if (context.departmentId) {
    parts.push(`and(scope_type.eq.department,scope_id.eq.${context.departmentId})`);
  }
  if (context.roleName) {
    parts.push(`and(scope_type.eq.role,scope_id.eq.${context.roleName})`);
  }
  if (context.userId) {
    parts.push(`and(scope_type.eq.user,scope_id.eq.${context.userId})`);
  }
  return parts.join(",");
}

export function createLoginAppFeatureFlagReadPort(
  client: SupabaseClient,
  ctx: LoginAppPortContext,
): FeatureFlagReadPort {
  return {
    async listApplicable(tenantId, context) {
      if (tenantId !== ctx.companyId || !canRead(ctx)) return [];

      const { data, error } = await client
        .from("platform_feature_flags")
        .select(
          "feature_key, scope_type, scope_id, enabled, rollout_percentage, environment, activates_at, expires_at, prerequisites, priority",
        )
        .or(buildScopeFilter(tenantId, { ...context, companyId: tenantId }));

      if (error) {
        throw new FeatureFlagReadError(error.message);
      }
      if (!data) {
        throw new FeatureFlagReadError("Feature flag read returned no data");
      }
      return Object.freeze((data as FeatureFlagDbRow[]).map(mapRow));
    },

    async resolve(tenantId, featureKey, context) {
      try {
        const rows = await this.listApplicable(tenantId, context);
        return featureFlagEngine.resolve(featureKey, rows, { ...context, companyId: tenantId });
      } catch (error) {
        if (error instanceof FeatureFlagReadError) {
          return denyOnReadFailure(featureKey);
        }
        throw error;
      }
    },

    async resolveMany(tenantId, featureKeys, context) {
      try {
        const rows = await this.listApplicable(tenantId, context);
        return featureFlagEngine.resolveMany(featureKeys, rows, { ...context, companyId: tenantId });
      } catch (error) {
        if (error instanceof FeatureFlagReadError) {
          return Object.freeze(
            Object.fromEntries(featureKeys.map((key) => [key, false])),
          );
        }
        throw error;
      }
    },
  };
}
