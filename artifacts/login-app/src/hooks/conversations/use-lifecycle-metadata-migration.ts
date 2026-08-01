import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ConversationRecord } from "@workspace/ai-conversation";
import { useConversationServices } from "@/lib/ai-conversation";
import {
  migrateLifecycleMetadata,
  needsLifecycleMetadataMigration,
} from "@/lib/conversation-lifecycle/integration/lifecycle-metadata-migration";
import { persistLifecycleMetadata } from "@/lib/conversation-lifecycle/adapters/backend-action-executor";

/**
 * Automatically migrates legacy conversations missing metadata.lifecycle on open.
 * Runs once per conversation per session; persisted migratedAt prevents re-runs.
 */
export function useLifecycleMetadataMigration(
  record: ConversationRecord | null | undefined,
  companyId: string | null,
) {
  const queryClient = useQueryClient();
  const { services, context } = useConversationServices();
  const inFlightRef = useRef(new Set<string>());

  useEffect(() => {
    if (!record || !companyId) return;
    if (inFlightRef.current.has(record.id)) return;
    if (!needsLifecycleMetadataMigration(record)) return;

    inFlightRef.current.add(record.id);
    const metadata = migrateLifecycleMetadata(record);

    void persistLifecycleMetadata(services, context, record.id, metadata)
      .then(() =>
        queryClient.invalidateQueries({ queryKey: ["conversation-list", companyId] }),
      )
      .catch(() => {
        inFlightRef.current.delete(record.id);
      });
  }, [record, companyId, services, context, queryClient]);
}
