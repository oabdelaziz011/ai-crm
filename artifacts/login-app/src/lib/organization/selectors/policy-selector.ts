import type { OrganizationPolicy, PolicyScopeLevel, PolicyType } from "@/lib/organization/types";

const SCOPE_ORDER: PolicyScopeLevel[] = ["organization", "region", "branch_group", "branch"];

/** Resolves effective policy via inheritance chain. */
export function resolvePolicyChain(
  policies: OrganizationPolicy[],
  branchId: string,
  regionId: string | null,
  branchGroupId: string | null,
  policyType: PolicyType,
): Record<string, unknown> {
  let merged: Record<string, unknown> = {};

  for (const level of SCOPE_ORDER) {
    const scopeId =
      level === "organization" ? null
      : level === "region" ? regionId
      : level === "branch_group" ? branchGroupId
      : branchId;

    const match = policies
      .filter((p) => p.policyType === policyType && p.scopeLevel === level && p.isActive)
      .filter((p) => (level === "organization" ? p.scopeId === null : p.scopeId === scopeId))
      .sort((a, b) => b.priority - a.priority)[0];

    if (match) {
      merged = { ...merged, ...match.config };
      if (!match.inheritsFromParent) break;
    }
  }

  return merged;
}

export function policyDiff(
  parent: Record<string, unknown>,
  child: Record<string, unknown>,
): string[] {
  return Object.keys(child).filter((k) => JSON.stringify(parent[k]) !== JSON.stringify(child[k]));
}
