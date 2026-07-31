import type {
  DashboardRealtimeConnectionState,
  DashboardRealtimeEvent,
} from "../realtime-event-types.js";

export type DashboardRealtimeEventPortOptions = {
  onConnectionChange?: (state: DashboardRealtimeConnectionState) => void;
};

export interface DashboardRealtimeEventPort {
  subscribe(
    companyId: string,
    listener: (event: DashboardRealtimeEvent) => void,
    options?: DashboardRealtimeEventPortOptions,
  ): Promise<() => void>;

  reconnect?(companyId: string): Promise<void> | void;
  pulse?(companyId: string): void;
  getConnectionState?(companyId: string): DashboardRealtimeConnectionState;
}

export class InMemoryDashboardRealtimeEventPort implements DashboardRealtimeEventPort {
  private readonly listeners = new Map<string, Set<(event: DashboardRealtimeEvent) => void>>();
  private readonly connectionState = new Map<string, DashboardRealtimeConnectionState>();
  private connectionCallbacks = new Map<string, (state: DashboardRealtimeConnectionState) => void>();

  async subscribe(
    companyId: string,
    listener: (event: DashboardRealtimeEvent) => void,
    options?: DashboardRealtimeEventPortOptions,
  ): Promise<() => void> {
    const bucket = this.listeners.get(companyId) ?? new Set();
    bucket.add(listener);
    this.listeners.set(companyId, bucket);
    if (options?.onConnectionChange) {
      this.connectionCallbacks.set(companyId, options.onConnectionChange);
    }
    this.setConnectionState(companyId, "connected");
    return () => {
      bucket.delete(listener);
      if (bucket.size === 0) {
        this.listeners.delete(companyId);
        this.connectionCallbacks.delete(companyId);
        this.connectionState.delete(companyId);
      }
    };
  }

  emit(event: DashboardRealtimeEvent): void {
    const bucket = this.listeners.get(event.companyId);
    if (!bucket) return;
    for (const listener of bucket) listener(event);
  }

  setConnectionState(companyId: string, state: DashboardRealtimeConnectionState): void {
    this.connectionState.set(companyId, state);
    this.connectionCallbacks.get(companyId)?.(state);
  }

  reconnect(companyId: string): void {
    this.setConnectionState(companyId, "reconnecting");
    this.setConnectionState(companyId, "connected");
  }

  pulse(_companyId: string): void {}

  getConnectionState(companyId: string): DashboardRealtimeConnectionState {
    return this.connectionState.get(companyId) ?? "disconnected";
  }
}
