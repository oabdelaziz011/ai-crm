import type { SupabaseClient } from "@supabase/supabase-js";
import type { FeatureFlagRecord, FeatureFlagWritePort } from "@workspace/application-layer";
import type { LoginAppPortContext } from "./customer-read-port-adapter.js";

type FeatureFlagDbRow = {
  id: string;
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
  updated_at: string;
};

function mapRecord(row: FeatureFlagDbRow): FeatureFlagRecord {
  return Object.freeze({
    id: String(row.id),
    featureKey: String(row.feature_key),
    scopeType: String(row.scope_type),
    scopeId: row.scope_id,
    enabled: Boolean(row.enabled),
    rolloutPercentage: Number(row.rollout_percentage),
    environment: String(row.environment),
    activatesAt: row.activates_at,
    expiresAt: row.expires_at,
    prerequisites: Object.freeze(Array.isArray(row.prerequisites) ? row.prerequisites : []),
    priority: Number(row.priority),
    updatedAt: String(row.updated_at),
  });
}

function canWrite(ctx: LoginAppPortContext): boolean {
  if (ctx.isSuperAdmin) return true;
  return ctx.hasPermission("feature_flags.write") || ctx.hasPermission("feature_flags.publish");
}

export function createLoginAppFeatureFlagWritePort(
  client: SupabaseClient,
  ctx: LoginAppPortContext,
): FeatureFlagWritePort {
  return {
    async upsert(input) {
      if (input.tenantId !== ctx.companyId || !canWrite(ctx)) {
        throw new Error("Permission denied");
      }

      const payload = {
        feature_key: input.featureKey,
        scope_type: input.scopeType,
        scope_id: input.scopeId ?? input.tenantId,
        enabled: input.enabled,
        rollout_percentage: input.rolloutPercentage ?? 100,
        environment: input.environment ?? "all",
        activates_at: input.activatesAt ?? null,
        expires_at: input.expiresAt ?? null,
        prerequisites: input.prerequisites ?? [],
        priority: input.priority ?? 0,
        updated_at: new Date().toISOString(),
        updated_by: input.actorId,
      };

      const { data, error } = await client
        .from("platform_feature_flags")
        .upsert(payload, { onConflict: "feature_key,scope_type,scope_id,environment" })
        .select("*")
        .single();

      if (error || !data) {
        throw new Error(error?.message ?? "Failed to upsert feature flag");
      }

      return mapRecord(data as FeatureFlagDbRow);
    },
  };
}
