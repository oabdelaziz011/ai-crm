import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  EmailRoutingCategory,
  EmailRoutingTargetResolver,
  EmailRoutingTargetResolution,
} from "@workspace/ai-intent-engine";

const SUPPORTED_TARGET_TYPES = new Set(["department", "employee", "queue"]);

export type CompanyEmailRoutingCategoryRow = {
  category: string;
  enabled: boolean;
  target_type: string;
  target_id: string | null;
};

/**
 * Maps a persisted category config row to an engine resolution.
 * Disabled / missing target_id → null (unresolved).
 */
export function resolveEmailRoutingTargetFromConfig(input: {
  category: EmailRoutingCategory;
  rows: readonly CompanyEmailRoutingCategoryRow[];
}): EmailRoutingTargetResolution | null {
  const row = input.rows.find((candidate) => candidate.category === input.category);
  if (!row || row.enabled !== true) return null;
  const targetId = typeof row.target_id === "string" ? row.target_id.trim() : "";
  if (!targetId) return null;
  if (!SUPPORTED_TARGET_TYPES.has(row.target_type)) return null;
  return {
    targetType: row.target_type as EmailRoutingTargetResolution["targetType"],
    targetId,
  };
}

/**
 * Loads company_email_routing_category_targets for the inbound company
 * and resolves category → department | employee | queue.
 */
export function createSupabaseEmailRoutingTargetResolver(
  client: SupabaseClient,
): EmailRoutingTargetResolver {
  return {
    async resolveTarget({ companyId, category }) {
      const resolvedCompanyId = companyId?.trim();
      if (!resolvedCompanyId) return null;

      const { data, error } = await client
        .from("company_email_routing_category_targets")
        .select("category, enabled, target_type, target_id")
        .eq("company_id", resolvedCompanyId)
        .eq("category", category)
        .maybeSingle();

      if (error || !data) return null;

      return resolveEmailRoutingTargetFromConfig({
        category,
        rows: [data as CompanyEmailRoutingCategoryRow],
      });
    },
  };
}
