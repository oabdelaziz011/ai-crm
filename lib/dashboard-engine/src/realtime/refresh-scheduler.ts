export type RefreshSchedulerOptions = {
  debounceMs: number;
  throttleMs: number;
  batchWindowMs: number;
  isDocumentVisible?: () => boolean;
};

export type RefreshSchedulerListener = (companyId: string) => void;

export class DashboardRefreshScheduler {
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private throttleUntil = 0;
  private lastFlushAt = 0;
  private pausedForVisibility = false;
  private pendingCompanyId: string | null = null;

  constructor(
    private readonly options: RefreshSchedulerOptions,
    private readonly listener: RefreshSchedulerListener,
  ) {}

  schedule(companyId: string): void {
    this.pendingCompanyId = companyId;

    if (this.options.isDocumentVisible && !this.options.isDocumentVisible()) {
      this.pausedForVisibility = true;
      return;
    }

    this.pausedForVisibility = false;

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.flush();
    }, this.options.debounceMs);
  }

  resumeAfterVisibility(companyId: string): void {
    if (!this.pausedForVisibility) return;
    this.pausedForVisibility = false;
    this.schedule(companyId);
  }

  flushNow(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.flush();
  }

  private flush(): void {
    const companyId = this.pendingCompanyId;
    if (!companyId) return;

    const now = Date.now();
    if (now < this.throttleUntil) {
      const delay = this.throttleUntil - now;
      this.debounceTimer = setTimeout(() => {
        this.debounceTimer = null;
        this.flush();
      }, delay);
      return;
    }

    this.listener(companyId);
    this.lastFlushAt = now;
    this.throttleUntil = now + this.options.throttleMs;
  }

  get paused(): boolean {
    return this.pausedForVisibility;
  }

  get lastScheduledAt(): number {
    return this.lastFlushAt;
  }

  dispose(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }
}

export function computeReconnectDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
): number {
  const exponential = baseDelayMs * 2 ** Math.max(0, attempt - 1);
  return Math.min(maxDelayMs, exponential);
}
