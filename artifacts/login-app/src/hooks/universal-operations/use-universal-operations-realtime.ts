import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { invalidateOperationsPlatformQueries } from "@/lib/application-layer/operations-platform-sync";

const WATCHED_TABLES = [
  "scheduling_bookings",
  "customer_payments",
  "invoices",
  "customers",
  "tasks",
  "operations_workspace_config",
  "platform_configurations",
  "platform_configuration_versions",
  "platform_feature_flags",
  "platform_company_licenses",
  "platform_reactive_signals",
  "automation_runs",
  "entity_contacts",
  "entity_files",
  "entity_tag_assignments",
  "entity_activities",
  "entity_custom_field_values",
] as const;

/** Supabase realtime — incremental queue/platform refresh without page reload. */
export function useUniversalOperationsRealtime(companyId: string | null) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!companyId) return;

    const channel = supabase.channel(`universal-operations:${companyId}`);

    for (const table of WATCHED_TABLES) {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: table.startsWith("entity_")
            ? `tenant_id=eq.${companyId}`
            : table === "automation_runs"
              ? `company_id=eq.${companyId}`
              : table === "platform_feature_flags"
                ? undefined
                : table === "platform_company_licenses"
                  ? `tenant_id=eq.${companyId}`
                  : table === "platform_reactive_signals"
                    ? `tenant_id=eq.${companyId}`
                    : `company_id=eq.${companyId}`,
        },
        () => {
          invalidateOperationsPlatformQueries(qc, { companyId });
          if (table === "platform_feature_flags" || table === "platform_company_licenses") {
            void qc.invalidateQueries({ queryKey: ["feature-flag"] });
            void qc.invalidateQueries({ queryKey: ["license-access"] });
          }
          if (table === "platform_reactive_signals") {
            void qc.invalidateQueries({ queryKey: ["dashboard"] });
            void qc.invalidateQueries({ queryKey: ["dashboard-snapshot"] });
            void qc.invalidateQueries({ queryKey: ["configuration"] });
            void qc.invalidateQueries({ queryKey: ["universal-operations"] });
          }
        },
      );
    }

    void channel.subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [companyId, qc]);
}
