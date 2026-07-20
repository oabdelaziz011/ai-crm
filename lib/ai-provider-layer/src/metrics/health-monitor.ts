export type ProviderHealthSnapshot = {
  providerKey: string;
  available: boolean;
  latencyMs: number | null;
  lastError: string | null;
  successRate: number;
  checkedAt: string;
};

export class HealthMonitor {
  private readonly snapshots = new Map<string, ProviderHealthSnapshot>();
  private readonly attempts = new Map<string, { success: number; total: number }>();

  recordAttempt(providerKey: string, success: boolean, latencyMs: number, errorMessage?: string | null): ProviderHealthSnapshot {
    const stats = this.attempts.get(providerKey) ?? { success: 0, total: 0 };
    stats.total += 1;
    if (success) stats.success += 1;
    this.attempts.set(providerKey, stats);

    const snapshot: ProviderHealthSnapshot = {
      providerKey,
      available: success,
      latencyMs: success ? latencyMs : null,
      lastError: success ? null : (errorMessage ?? "Provider request failed."),
      successRate: stats.total === 0 ? 0 : Number((stats.success / stats.total).toFixed(4)),
      checkedAt: new Date().toISOString(),
    };
    this.snapshots.set(providerKey, snapshot);
    return snapshot;
  }

  get(providerKey: string): ProviderHealthSnapshot | null {
    return this.snapshots.get(providerKey) ?? null;
  }

  list(): ProviderHealthSnapshot[] {
    return [...this.snapshots.values()];
  }
}
