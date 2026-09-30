/**
 * Batch presence of CRM entity notes (manual_note) for the customers list.
 * Entity Notes are the live notes store — customer.notes is only the legacy pinned blob.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { APP_QUERY_STALE_MS } from "@/lib/react-query/create-query-client";

export { mergeEntityNoteTagsIntoRows } from "./customer-entity-notes-merge";

export function customerEntityNotesPresenceKey(
  companyId: string | null | undefined,
  customerIdsKey: string,
) {
  return ["customers-list-entity-notes", companyId ?? "none", customerIdsKey] as const;
}

/**
 * Returns customer ids that have at least one non-deleted entity note.
 * Chunks `.in()` to stay within PostgREST URL limits.
 */
export async function fetchCustomerIdsWithEntityNotes(input: {
  companyId: string;
  customerIds: string[];
}): Promise<Set<string>> {
  const ids = [...new Set(input.customerIds.map((id) => id.trim()).filter(Boolean))];
  if (!input.companyId.trim() || ids.length === 0) return new Set();

  const found = new Set<string>();
  const chunkSize = 200;

  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from("entity_activities")
      .select("entity_id")
      .eq("tenant_id", input.companyId)
      .eq("entity_type", "customer")
      .eq("activity_type", "manual_note")
      .is("deleted_at", null)
      .in("entity_id", chunk);

    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      const entityId = typeof row.entity_id === "string" ? row.entity_id : "";
      if (entityId) found.add(entityId);
    }
  }

  return found;
}

export function useCustomerEntityNotesPresence(
  companyId: string | null | undefined,
  customerIds: string[],
) {
  const sortedKey = [...customerIds].sort().join(",");
  return useQuery({
    queryKey: customerEntityNotesPresenceKey(companyId, sortedKey),
    enabled: Boolean(companyId) && customerIds.length > 0,
    staleTime: APP_QUERY_STALE_MS,
    queryFn: () =>
      fetchCustomerIdsWithEntityNotes({
        companyId: companyId!,
        customerIds,
      }),
  });
}
