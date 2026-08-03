import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReactiveSignalPort } from "@workspace/application-layer";

export function createLoginAppReactiveSignalPort(client: SupabaseClient): ReactiveSignalPort {
  return {
    async emit(input) {
      const { error } = await client.from("platform_reactive_signals").insert({
        tenant_id: input.tenantId,
        signal_type: input.signalType,
        entity_type: input.entityType ?? null,
        entity_id: input.entityId ?? null,
        correlation_id: input.correlationId,
        source_subscriber: input.sourceSubscriber,
        metadata: input.metadata ?? {},
      });
      if (error) throw error;
    },
  };
}
