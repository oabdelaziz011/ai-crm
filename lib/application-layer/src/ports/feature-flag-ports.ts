import type {
  FeatureFlagResolution,
  FeatureFlagResolutionContext,
  FeatureFlagRow,
} from "@workspace/configuration-platform";

export type FeatureFlagRecord = Readonly<{
  id: string;
  featureKey: string;
  scopeType: string;
  scopeId: string | null;
  enabled: boolean;
  rolloutPercentage: number;
  environment: string;
  activatesAt: string | null;
  expiresAt: string | null;
  prerequisites: readonly string[];
  priority: number;
  updatedAt: string;
}>;

export type FeatureFlagUpsertInput = Readonly<{
  tenantId: string;
  featureKey: string;
  scopeType: string;
  scopeId?: string | null;
  enabled: boolean;
  rolloutPercentage?: number;
  environment?: string;
  activatesAt?: string | null;
  expiresAt?: string | null;
  prerequisites?: readonly string[];
  priority?: number;
  actorId: string;
  reason?: string;
}>;

export type FeatureFlagReadPort = {
  listApplicable(
    tenantId: string,
    context: FeatureFlagResolutionContext,
  ): Promise<readonly FeatureFlagRow[]>;
  resolve(
    tenantId: string,
    featureKey: string,
    context: FeatureFlagResolutionContext,
  ): Promise<FeatureFlagResolution>;
  resolveMany(
    tenantId: string,
    featureKeys: readonly string[],
    context: FeatureFlagResolutionContext,
  ): Promise<Readonly<Record<string, boolean>>>;
};

export type FeatureFlagWritePort = {
  upsert(input: FeatureFlagUpsertInput): Promise<FeatureFlagRecord>;
};

export type { FeatureFlagResolution, FeatureFlagResolutionContext, FeatureFlagRow };
