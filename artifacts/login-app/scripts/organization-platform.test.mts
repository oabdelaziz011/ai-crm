import assert from "node:assert/strict";
import { buildHierarchyTree, computeAverageHealthScore } from "../src/lib/organization/selectors/hierarchy-selector.ts";
import { resolvePolicyChain, policyDiff } from "../src/lib/organization/selectors/policy-selector.ts";
import { buildBranchComparison, buildHeatmap } from "../src/lib/organization/analytics/enterprise-analytics-selector.ts";
import { filterBranchesByRegionAccess } from "../src/lib/organization/security/organization-permissions.ts";
import type { OrganizationPolicy, OrganizationRegion, BranchGroup, BranchProfile } from "../src/lib/organization/types/organization-types.ts";

const regions: OrganizationRegion[] = [
  { id: "r1", companyId: "c1", name: "North", code: "N", description: null, managerUserId: null, timezone: "UTC", isActive: true },
  { id: "r2", companyId: "c1", name: "South", code: "S", description: null, managerUserId: null, timezone: "UTC", isActive: true },
];

const groups: BranchGroup[] = [
  { id: "g1", companyId: "c1", regionId: "r1", name: "Metro", code: null, isActive: true },
];

const branches: BranchProfile[] = [
  { id: "b1", companyId: "c1", name: "Main Clinic", code: "M1", regionId: "r1", branchGroupId: "g1", timezone: "UTC", currency: "USD", healthScore: 90, status: "active", branding: {}, settings: {} },
  { id: "b2", companyId: "c1", name: "Downtown", code: "D1", regionId: "r1", branchGroupId: null, timezone: "UTC", currency: "USD", healthScore: 80, status: "active", branding: {}, settings: {} },
  { id: "b3", companyId: "c1", name: "South Hub", code: "S1", regionId: "r2", branchGroupId: null, timezone: "UTC", currency: "USD", healthScore: 70, status: "active", branding: {}, settings: {} },
];

{
  const tree = buildHierarchyTree(regions, groups, branches);
  assert.equal(tree.length, 1);
  assert.equal(tree[0].level, "organization");
  assert.equal(tree[0].children.length, 2);
  const north = tree[0].children.find((n) => n.id === "r1");
  assert.ok(north);
  assert.ok(north.children.some((c) => c.id === "g1"));
  assert.ok(north.children.some((c) => c.id === "b2"));
}

{
  assert.equal(computeAverageHealthScore(branches), 80);
  assert.equal(computeAverageHealthScore([]), 100);
}

{
  const policies: OrganizationPolicy[] = [
    { id: "p1", companyId: "c1", scopeLevel: "organization", scopeId: null, policyType: "cancellation", config: { hours: 24 }, inheritsFromParent: true, priority: 1, isActive: true },
    { id: "p2", companyId: "c1", scopeLevel: "branch", scopeId: "b1", policyType: "cancellation", config: { hours: 48 }, inheritsFromParent: false, priority: 2, isActive: true },
  ];
  const resolved = resolvePolicyChain(policies, "b1", "r1", "g1", "cancellation");
  assert.equal(resolved.hours, 48);
  const branch2 = resolvePolicyChain(policies, "b2", "r1", null, "cancellation");
  assert.equal(branch2.hours, 24);
  const diff = policyDiff({ hours: 24 }, { hours: 48 });
  assert.deepEqual(diff, ["hours"]);
}

{
  const comparisons = buildBranchComparison([
    { branchId: "b1", branchName: "Main", regionName: "North", healthScore: 90, bookings: [{ status: "completed", priceCents: 5000 }, { status: "no_show", priceCents: 0 }] },
    { branchId: "b2", branchName: "Downtown", regionName: "North", healthScore: 80, bookings: [{ status: "completed", priceCents: 10000 }] },
  ]);
  assert.equal(comparisons.length, 2);
  assert.equal(comparisons[0].ranking, 1);
  assert.equal(comparisons[0].revenueCents, 10000);
  assert.equal(comparisons[1].noShowRate, 50);
  const heatmap = buildHeatmap(comparisons);
  assert.ok(heatmap.length >= 4);
}

{
  const filtered = filterBranchesByRegionAccess(branches, ["r1"], false);
  assert.equal(filtered.length, 2);
  const all = filterBranchesByRegionAccess(branches, ["r1"], true);
  assert.equal(all.length, 3);
}

console.log("organization-platform tests passed");
