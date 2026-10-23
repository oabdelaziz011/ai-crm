/**
 * Visual order for the leads Kanban.
 * فرصة (`demo_completed`) comes after إرسال عرض السعر (`proposal_sent`).
 * Persisted lifecycle keys are unchanged.
 */
export const LEAD_KANBAN_LIFECYCLE_ORDER = [
  "new",
  "qualified",
  "contacted",
  "nurturing",
  "demo_scheduled",
  "proposal_sent",
  "demo_completed",
  "negotiation",
  "won",
  "lost",
  "converted",
  "archived",
] as const;

export function leadKanbanLifecycleRank(lifecycleStatus: string | null | undefined): number {
  const index = LEAD_KANBAN_LIFECYCLE_ORDER.indexOf(
    (lifecycleStatus ?? "") as (typeof LEAD_KANBAN_LIFECYCLE_ORDER)[number],
  );
  return index === -1 ? LEAD_KANBAN_LIFECYCLE_ORDER.length : index;
}

export function compareLeadKanbanStages(
  a: { lifecycleStatus?: string | null; sortOrder?: number | null },
  b: { lifecycleStatus?: string | null; sortOrder?: number | null },
): number {
  const delta = leadKanbanLifecycleRank(a.lifecycleStatus) - leadKanbanLifecycleRank(b.lifecycleStatus);
  if (delta !== 0) return delta;
  return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
}
