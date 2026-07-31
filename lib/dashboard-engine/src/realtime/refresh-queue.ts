import type { DashboardRealtimeEvent, DashboardRefreshScope } from "./realtime-event-types.js";
import { mergeRefreshScopes, resolveRefreshScope } from "./event-scope-map.js";

export type QueuedRefresh = {
  dedupeKey: string;
  companyId: string;
  scope: DashboardRefreshScope;
  eventIds: string[];
  enqueuedAt: number;
};

function eventDedupeKey(event: DashboardRealtimeEvent): string {
  return `${event.companyId}:${event.type}:${event.source ?? "default"}`;
}

export class DashboardRefreshQueue {
  private readonly pending = new Map<string, QueuedRefresh>();

  enqueue(event: DashboardRealtimeEvent): QueuedRefresh | null {
    if (event.type === "heartbeat" || event.type === "reconnect") {
      return null;
    }

    const dedupeKey = eventDedupeKey(event);
    const existing = this.pending.get(dedupeKey);
    if (existing) {
      existing.eventIds.push(event.id);
      existing.scope = mergeRefreshScopes([existing.scope, resolveRefreshScope(event.type)]);
      return existing;
    }

    const queued: QueuedRefresh = {
      dedupeKey,
      companyId: event.companyId,
      scope: resolveRefreshScope(event.type),
      eventIds: [event.id],
      enqueuedAt: Date.now(),
    };
    this.pending.set(dedupeKey, queued);
    return queued;
  }

  drain(companyId: string): QueuedRefresh[] {
    const entries = [...this.pending.values()].filter((entry) => entry.companyId === companyId);
    for (const entry of entries) {
      this.pending.delete(entry.dedupeKey);
    }
    return entries;
  }

  peek(companyId: string): QueuedRefresh[] {
    return [...this.pending.values()].filter((entry) => entry.companyId === companyId);
  }

  size(companyId?: string): number {
    if (!companyId) return this.pending.size;
    return this.peek(companyId).length;
  }

  clear(companyId?: string): void {
    if (!companyId) {
      this.pending.clear();
      return;
    }
    for (const entry of this.peek(companyId)) {
      this.pending.delete(entry.dedupeKey);
    }
  }
}

export const dashboardRefreshQueue = new DashboardRefreshQueue();
