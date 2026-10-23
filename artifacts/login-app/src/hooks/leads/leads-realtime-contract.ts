/**
 * Prefixes invalidated when a lead row changes.
 * Kanban is ["leads-workspace", "kanban", ...] and the table is
 * ["leads-workspace", "list", ...], so the leads-workspace prefix covers both.
 * Lead360 is ["lead360-workspace", leadId, companyId, role].
 * Opportunity board and table use the opportunities-workspace prefix.
 */
export const LEADS_REALTIME_INVALIDATION_KEYS = [
  ["leads-workspace"],
  ["lead360-workspace"],
  ["opportunities-workspace"],
] as const;

export function leadsRealtimeCoversKanbanTableAndLead360(): boolean {
  const roots = LEADS_REALTIME_INVALIDATION_KEYS.map((key) => key[0]);
  return (
    roots.includes("leads-workspace") &&
    roots.includes("lead360-workspace") &&
    roots.includes("opportunities-workspace")
  );
}
