import { useEffect, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createDashboardRealtimeEngine } from "@workspace/dashboard-engine";
import { createSupabaseDashboardRealtimePort } from "@/lib/dashboard/adapters/supabase-dashboard-realtime-port";
import type { DashboardTimeRange } from "@/lib/dashboard/selectors/executive-dashboard-selectors";
import { useDashboardAccess } from "@/lib/dashboard/hooks/use-dashboard-snapshot";
import { dashboardSnapshotKey } from "@/lib/dashboard/cache/query-keys";

const dashboardRealtimePort = createSupabaseDashboardRealtimePort();

function isDocumentVisible(): boolean {
  if (typeof document === "undefined") return true;
  return document.visibilityState === "visible";
}

export function useDashboardRealtime(
  companyId: string | null,
  timeRange: DashboardTimeRange = "30d",
  enabled = true,
) {
  const access = useDashboardAccess();
  const queryClient = useQueryClient();
  const engineRef = useRef<ReturnType<typeof createDashboardRealtimeEngine> | null>(null);

  const coordinator = useMemo(() => {
    if (!access || !companyId) return null;
    return () => {
      void queryClient.invalidateQueries({
        queryKey: dashboardSnapshotKey(companyId, timeRange, "application-layer"),
      });
    };
  }, [access, companyId, queryClient, timeRange]);

  useEffect(() => {
    if (!enabled || !access || !companyId || !coordinator) return;

    const engine =
      engineRef.current
      ?? createDashboardRealtimeEngine(dashboardRealtimePort, {
        debounceMs: 400,
        throttleMs: 2_000,
        batchWindowMs: 300,
        heartbeatIntervalMs: 30_000,
        isDocumentVisible,
      });
    engineRef.current = engine;

    let cancelled = false;
    let subscription: { unsubscribe: () => void } | null = null;

    void engine
      .subscribe({
        companyId,
        access,
        allowedProviderIds: ["executive-analytics", "finance", "bookings", "invoices", "crm"],
        onRefresh: coordinator,
      })
      .then((active) => {
        if (cancelled) {
          active.unsubscribe();
          return;
        }
        subscription = active;
      });

    const handleVisibility = () => {
      if (!isDocumentVisible() || !engineRef.current) return;
      engineRef.current.reconnect(companyId);
    };

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibility);
      subscription?.unsubscribe();
      engine.unsubscribe(companyId);
    };
  }, [access, companyId, coordinator, enabled]);
}
