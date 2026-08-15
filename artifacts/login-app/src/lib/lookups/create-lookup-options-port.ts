import type { LookupOptionsPort } from "@workspace/automation-platform";
import { wxRecordServiceResolution } from "@workspace/automation-platform";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchLookupOptions } from "./lookup-options-service";
import type { ListLookupConfig } from "./types";

export function createLookupOptionsPort(client?: SupabaseClient): LookupOptionsPort {
  return {
    async fetchListOptions(companyId, config) {
      wxRecordServiceResolution(`lookupOptions.fetchListOptions:${String((config as ListLookupConfig).lookup)}`);
      const rows = await fetchLookupOptions(
        companyId,
        config as ListLookupConfig,
        client,
      );
      return rows.map((row) => ({
        id: row.id,
        title: row.title,
        ...(row.description?.trim() ? { description: row.description.trim() } : {}),
        value: row.value ?? row.id,
        ...(row.record ? { record: row.record } : {}),
      }));
    },
  };
}
