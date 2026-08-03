import type { FeatureFlagEnvironment, FeatureFlagScope } from "./constants.js";

export type FeatureFlagRow = Readonly<{
  featureKey: string;
  scopeType: FeatureFlagScope;
  scopeId: string | null;
  enabled: boolean;
  rolloutPercentage: number;
  environment: FeatureFlagEnvironment | "all";
  activatesAt: string | null;
  expiresAt: string | null;
  prerequisites: readonly string[];
  priority: number;
}>;

export type FeatureFlagResolutionContext = Readonly<{
  environment?: FeatureFlagEnvironment;
  planId?: string | null;
  companyId?: string | null;
  branchId?: string | null;
  departmentId?: string | null;
  roleName?: string | null;
  userId?: string | null;
  /** Stable hash for percentage rollout (e.g. userId). */
  rolloutSubjectId?: string | null;
  now?: Date;
}>;

export type FeatureFlagResolution = Readonly<{
  featureKey: string;
  enabled: boolean;
  source: FeatureFlagScope | "default";
  matchedScopeId?: string | null;
}>;

function isActiveWindow(row: FeatureFlagRow, now: Date): boolean {
  if (row.activatesAt && new Date(row.activatesAt) > now) return false;
  if (row.expiresAt && new Date(row.expiresAt) <= now) return false;
  return true;
}

function matchesEnvironment(row: FeatureFlagRow, environment?: FeatureFlagEnvironment): boolean {
  if (!environment || row.environment === "all") return true;
  return row.environment === environment;
}

function scopePriority(scope: FeatureFlagScope): number {
  switch (scope) {
    case "user":
      return 70;
    case "role":
      return 60;
    case "department":
      return 50;
    case "branch":
      return 40;
    case "company":
      return 30;
    case "plan":
      return 20;
    case "global":
      return 10;
    default:
      return 0;
  }
}

function matchesScope(row: FeatureFlagRow, ctx: FeatureFlagResolutionContext): boolean {
  switch (row.scopeType) {
    case "global":
      return true;
    case "plan":
      return Boolean(ctx.planId && row.scopeId === ctx.planId);
    case "company":
      return Boolean(ctx.companyId && row.scopeId === ctx.companyId);
    case "branch":
      return Boolean(ctx.branchId && row.scopeId === ctx.branchId);
    case "department":
      return Boolean(ctx.departmentId && row.scopeId === ctx.departmentId);
    case "role":
      return Boolean(ctx.roleName && row.scopeId === ctx.roleName);
    case "user":
      return Boolean(ctx.userId && row.scopeId === ctx.userId);
    default:
      return false;
  }
}

function passesRollout(row: FeatureFlagRow, subjectId?: string | null): boolean {
  if (row.rolloutPercentage >= 100) return true;
  if (row.rolloutPercentage <= 0) return false;
  if (!subjectId) return row.rolloutPercentage >= 50;
  let hash = 0;
  for (let i = 0; i < subjectId.length; i += 1) {
    hash = (hash + subjectId.charCodeAt(i) * (i + 1)) % 100;
  }
  return hash < row.rolloutPercentage;
}

export class FeatureFlagEngine {
  resolve(featureKey: string, rows: readonly FeatureFlagRow[], ctx: FeatureFlagResolutionContext): FeatureFlagResolution {
    const now = ctx.now ?? new Date();
    const candidates = rows
      .filter(
        (row) =>
          row.featureKey === featureKey &&
          matchesEnvironment(row, ctx.environment) &&
          isActiveWindow(row, now) &&
          matchesScope(row, ctx),
      )
      .sort((a, b) => scopePriority(b.scopeType) - scopePriority(a.scopeType) || b.priority - a.priority);

    const winner = candidates[0];
    if (!winner) {
      return Object.freeze({ featureKey, enabled: true, source: "default" });
    }

    const prerequisitesMet = winner.prerequisites.every((key) =>
      this.resolve(key, rows, ctx).enabled,
    );

    const enabled =
      winner.enabled && prerequisitesMet && passesRollout(winner, ctx.rolloutSubjectId ?? ctx.userId);

    return Object.freeze({
      featureKey,
      enabled,
      source: winner.scopeType,
      matchedScopeId: winner.scopeId,
    });
  }

  resolveMany(
    featureKeys: readonly string[],
    rows: readonly FeatureFlagRow[],
    ctx: FeatureFlagResolutionContext,
  ): Readonly<Record<string, boolean>> {
    const out: Record<string, boolean> = {};
    for (const key of featureKeys) {
      out[key] = this.resolve(key, rows, ctx).enabled;
    }
    return Object.freeze(out);
  }
}

export const featureFlagEngine = new FeatureFlagEngine();
