import { customerWorkspaceDashboardHref, customerWorkspaceHref } from "@/lib/customer-workspace/customer-workspace-utils";
import { toDashboardAbsolutePath } from "@/lib/routing";
import { normalizeEntityWorkspaceTab } from "./layout-registry";
import type { EntityWorkspaceModuleId, EntityWorkspaceTabId } from "./types";

export type EntityWorkspaceHrefInput = {
  module: EntityWorkspaceModuleId;
  entityType: string;
  entityId: string;
  tab?: string;
  operationId?: string | null;
};

function opsTabSegment(tab?: string): string | null {
  const normalized = normalizeEntityWorkspaceTab(tab, "overview");
  if (normalized === "overview") return null;
  if (normalized === "timeline") return "timeline";
  if (normalized === "activity") return "timeline";
  if (normalized === "files") return "files";
  if (normalized === "notes") return "notes";
  if (normalized === "communication") return "communication";
  if (normalized === "related") return "related";
  if (normalized === "tasks") return "tasks";
  if (normalized === "forms") return "forms";
  return normalized;
}

/**
 * Nest-relative href for the active module router.
 * Operations: `/entity/:type/:id[/:tab]` under `/dashboard/operations`.
 * CRM: delegates to existing customer workspace nest paths (unchanged).
 */
export function entityWorkspaceHref(input: EntityWorkspaceHrefInput): string {
  if (input.module === "crm" && input.entityType === "customer") {
    return customerWorkspaceHref(input.entityId, mapCrmTab(input.tab));
  }

  const segment = opsTabSegment(input.tab);
  let path = segment
    ? `/entity/${input.entityType}/${input.entityId}/${segment}`
    : `/entity/${input.entityType}/${input.entityId}`;

  if (input.operationId) {
    path += `?operationId=${encodeURIComponent(input.operationId)}`;
  }
  return path;
}

/**
 * Absolute dashboard href that escapes any nested router.
 * Operations stays under `/dashboard/operations/entity/...` — never CRM.
 * CRM stays under `/dashboard/customers/...`.
 */
export function entityWorkspaceDashboardHref(input: EntityWorkspaceHrefInput): string {
  if (input.module === "crm" && input.entityType === "customer") {
    return customerWorkspaceDashboardHref(input.entityId, mapCrmTab(input.tab));
  }

  const nestRelative = entityWorkspaceHref({ ...input, operationId: null });
  let absolute = `~${toDashboardAbsolutePath(`/operations${nestRelative.split("?")[0]}`)}`;
  if (input.operationId) {
    absolute += `?operationId=${encodeURIComponent(input.operationId)}`;
  }
  return absolute;
}

/** Convenience: Operations Queue → Entity Workspace (nest-relative). */
export function operationsEntityWorkspaceHref(
  entityId: string,
  options?: { entityType?: string; tab?: string; operationId?: string | null },
): string {
  return entityWorkspaceHref({
    module: "operations",
    entityType: options?.entityType ?? "customer",
    entityId,
    tab: options?.tab,
    operationId: options?.operationId,
  });
}

function mapCrmTab(tab?: string): string | undefined {
  if (!tab) return undefined;
  const normalized = normalizeEntityWorkspaceTab(tab, "overview") as EntityWorkspaceTabId;
  if (normalized === "timeline" || normalized === "activity") return "timeline";
  if (normalized === "files") return "files";
  if (normalized === "notes") return "communication";
  return normalized === "overview" ? undefined : normalized;
}
