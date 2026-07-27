import type { HierarchyNode, OrganizationRegion, BranchGroup, BranchProfile } from "@/lib/organization/types";
import { rankBy } from "@/lib/organization/utils/analytics-math";

export function buildHierarchyTree(
  regions: OrganizationRegion[],
  groups: BranchGroup[],
  branches: BranchProfile[],
): HierarchyNode[] {
  const orgNode: HierarchyNode = {
    id: "org",
    level: "organization",
    name: "Organization",
    parentId: null,
    children: [],
  };

  for (const region of regions) {
    const regionNode: HierarchyNode = {
      id: region.id,
      level: "region",
      name: region.name,
      parentId: "org",
      children: [],
    };

    const regionGroups = groups.filter((g) => g.regionId === region.id);
    for (const group of regionGroups) {
      const groupNode: HierarchyNode = {
        id: group.id,
        level: "branch_group",
        name: group.name,
        parentId: region.id,
        children: [],
      };

      const groupBranches = branches.filter((b) => b.branchGroupId === group.id);
      for (const branch of groupBranches) {
        groupNode.children.push({
          id: branch.id,
          level: "branch",
          name: branch.name,
          parentId: group.id,
          children: [],
          metadata: { healthScore: branch.healthScore, code: branch.code },
        });
      }

      regionNode.children.push(groupNode);
    }

    const ungroupedBranches = branches.filter(
      (b) => b.regionId === region.id && !b.branchGroupId,
    );
    for (const branch of ungroupedBranches) {
      regionNode.children.push({
        id: branch.id,
        level: "branch",
        name: branch.name,
        parentId: region.id,
        children: [],
        metadata: { healthScore: branch.healthScore },
      });
    }

    orgNode.children.push(regionNode);
  }

  const unassigned = branches.filter((b) => !b.regionId);
  for (const branch of unassigned) {
    orgNode.children.push({
      id: branch.id,
      level: "branch",
      name: branch.name,
      parentId: "org",
      children: [],
      metadata: { healthScore: branch.healthScore },
    });
  }

  return [orgNode];
}

export function computeAverageHealthScore(branches: BranchProfile[]): number {
  if (branches.length === 0) return 100;
  return Math.round(branches.reduce((s, b) => s + b.healthScore, 0) / branches.length);
}

export function rankBranches<T extends { healthScore: number; revenueCents?: number }>(
  rows: T[],
): Array<T & { ranking: number }> {
  return rankBy(rows, (r) => r.revenueCents ?? r.healthScore);
}
