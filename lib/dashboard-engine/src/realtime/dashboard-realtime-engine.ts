import type { DashboardAccess } from "../types.js";
import type {
  DashboardRealtimeConnectionState,
  DashboardRealtimeEngineOptions,
  DashboardRealtimeEvent,
  DashboardRefreshSignal,
  DashboardRealtimeSubscription,
} from "./realtime-event-types.js";
import { DEFAULT_REALTIME_ENGINE_OPTIONS } from "./realtime-event-types.js";
import { DashboardRefreshQueue } from "./refresh-queue.js";
import { DashboardRefreshScheduler, computeReconnectDelay } from "./refresh-scheduler.js";
import { filterProviderIdsByPermission, mergeRefreshScopes } from "./event-scope-map.js";
import type { DashboardRealtimeEventPort } from "./ports/realtime-event-port.js";

export type DashboardRealtimeRefreshHandler = (
  signal: DashboardRefreshSignal,
) => void | Promise<void>;

export type DashboardRealtimeSubscribeInput = {
  companyId: string;
  access: DashboardAccess;
  allowedProviderIds: string[];
  onRefresh: DashboardRealtimeRefreshHandler;
  onConnectionChange?: (state: DashboardRealtimeConnectionState) => void;
};

type ActiveSubscription = {
  companyId: string;
  unsubscribePort: () => void;
  scheduler: DashboardRefreshScheduler;
  heartbeatTimer: ReturnType<typeof setInterval> | null;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  reconnectAttempts: number;
  queue: DashboardRefreshQueue;
  onRefresh: DashboardRealtimeRefreshHandler;
  onConnectionChange?: (state: DashboardRealtimeConnectionState) => void;
  allowedProviderIds: Set<string>;
};

export class DashboardRealtimeEngine {
  private readonly options: Required<
    Pick<
      DashboardRealtimeEngineOptions,
      | "debounceMs"
      | "throttleMs"
      | "batchWindowMs"
      | "heartbeatIntervalMs"
      | "reconnectBaseDelayMs"
      | "reconnectMaxDelayMs"
      | "maxReconnectAttempts"
    >
  > & Pick<DashboardRealtimeEngineOptions, "isDocumentVisible">;

  private readonly subscriptions = new Map<string, ActiveSubscription>();

  constructor(
    private readonly eventPort: DashboardRealtimeEventPort,
    options: DashboardRealtimeEngineOptions = {},
  ) {
    this.options = {
      ...DEFAULT_REALTIME_ENGINE_OPTIONS,
      ...options,
    };
  }

  async subscribe(input: DashboardRealtimeSubscribeInput): Promise<DashboardRealtimeSubscription> {
    if (input.access.companyId !== input.companyId) {
      throw new Error("Cross-company realtime subscription is forbidden.");
    }

    if (
      !input.access.isSuperAdmin
      && !input.access.hasPermission("dashboard.view")
      && !input.access.hasPermission("executive.view")
      && !input.access.hasPermission("reports.view")
    ) {
      throw new Error("Dashboard view permission is required for realtime subscriptions.");
    }

    this.unsubscribe(input.companyId);

    const queue = new DashboardRefreshQueue();
    const allowedProviderIds = new Set(input.allowedProviderIds);
    let active: ActiveSubscription;

    const scheduler = new DashboardRefreshScheduler(
      {
        debounceMs: this.options.debounceMs,
        throttleMs: this.options.throttleMs,
        batchWindowMs: this.options.batchWindowMs,
        isDocumentVisible: this.options.isDocumentVisible,
      },
      async (companyId) => {
        const now = Date.now();
        const batchCutoff = now - this.options.batchWindowMs;
        const batch = queue.drain(companyId).filter((entry) => entry.enqueuedAt >= batchCutoff);
        if (batch.length === 0) return;

        const scope = mergeRefreshScopes(batch.map((entry) => entry.scope));
        const filteredProviderIds = filterProviderIdsByPermission(
          scope.providerIds,
          allowedProviderIds,
        );
        if (filteredProviderIds.length === 0 && scope.providerIds.length > 0) {
          return;
        }

        await input.onRefresh({
          companyId,
          scope: {
            ...scope,
            providerIds: filteredProviderIds.length > 0 ? filteredProviderIds : scope.providerIds,
          },
          reason: batch.map((entry) => entry.dedupeKey).join(","),
          scheduledAt: new Date(now).toISOString(),
          eventCount: batch.reduce((total, entry) => total + entry.eventIds.length, 0),
        });
      },
    );

    const handleEvent = (event: DashboardRealtimeEvent) => {
      if (event.companyId !== input.companyId) return;
      queue.enqueue(event);
      scheduler.schedule(input.companyId);
    };

    const connectionHandlers: {
      onConnectionChange?: (state: DashboardRealtimeConnectionState) => void;
    } = {};

    const unsubscribePort = await this.eventPort.subscribe(input.companyId, handleEvent, {
      onConnectionChange: (state) => {
        connectionHandlers.onConnectionChange?.(state);
        const current = this.subscriptions.get(input.companyId);
        if (state === "disconnected" && current) {
          this.scheduleReconnect(current);
        }
        if (state === "connected" && current) {
          current.reconnectAttempts = 0;
        }
      },
    });

    const heartbeatTimer = setInterval(() => {
      this.eventPort.pulse?.(input.companyId);
      if (queue.size(input.companyId) > 0) {
        scheduler.resumeAfterVisibility(input.companyId);
      }
    }, this.options.heartbeatIntervalMs);

    active = {
      companyId: input.companyId,
      unsubscribePort,
      scheduler,
      heartbeatTimer,
      reconnectTimer: null,
      reconnectAttempts: 0,
      queue,
      onRefresh: input.onRefresh,
      onConnectionChange: input.onConnectionChange,
      allowedProviderIds,
    };

    connectionHandlers.onConnectionChange = (state) => {
      active.onConnectionChange?.(state);
    };

    this.subscriptions.set(input.companyId, active);

    return {
      companyId: input.companyId,
      unsubscribe: () => this.unsubscribe(input.companyId),
    };
  }

  unsubscribe(companyId: string): void {
    const active = this.subscriptions.get(companyId);
    if (!active) return;

    if (active.reconnectTimer) clearTimeout(active.reconnectTimer);
    if (active.heartbeatTimer) clearInterval(active.heartbeatTimer);
    active.scheduler.dispose();
    active.queue.clear(companyId);
    active.unsubscribePort();
    this.subscriptions.delete(companyId);
  }

  reconnect(companyId: string): void {
    const active = this.subscriptions.get(companyId);
    if (!active) return;
    active.onConnectionChange?.("reconnecting");
    void this.eventPort.reconnect?.(companyId);
  }

  getConnectionState(companyId: string): DashboardRealtimeConnectionState {
    return this.eventPort.getConnectionState?.(companyId) ?? "disconnected";
  }

  private scheduleReconnect(active: ActiveSubscription): void {
    if (active.reconnectAttempts >= this.options.maxReconnectAttempts) return;
    if (active.reconnectTimer) return;

    active.reconnectAttempts += 1;
    active.onConnectionChange?.("reconnecting");
    const delay = computeReconnectDelay(
      active.reconnectAttempts,
      this.options.reconnectBaseDelayMs,
      this.options.reconnectMaxDelayMs,
    );

    active.reconnectTimer = setTimeout(() => {
      active.reconnectTimer = null;
      void this.eventPort.reconnect?.(active.companyId);
    }, delay);
  }
}

export function createDashboardRealtimeEngine(
  eventPort: DashboardRealtimeEventPort,
  options?: DashboardRealtimeEngineOptions,
): DashboardRealtimeEngine {
  return new DashboardRealtimeEngine(eventPort, options);
}
