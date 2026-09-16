/** Default matches `DEFAULT_PRESENCE_HEARTBEAT_MS` from human-handoff-platform. */
const DEFAULT_CLIENT_HEARTBEAT_MS = 30_000;

export type PresenceHeartbeatControllerOptions = {
  intervalMs?: number;
  isVisible: () => boolean;
  onHeartbeat: () => void | Promise<void>;
  setIntervalFn?: (handler: () => void, ms: number) => ReturnType<typeof setInterval> | number;
  clearIntervalFn?: (id: ReturnType<typeof setInterval> | number) => void;
};

/**
 * Lightweight presence heartbeat scheduler.
 * - One interval at a time (no duplicate timers)
 * - Skips beats while hidden; caller should invoke onVisibilityChange on visibility events
 * - Prompt beat when becoming visible again
 * - stop() clears timer (logout / unmount)
 */
export function createPresenceHeartbeatController(options: PresenceHeartbeatControllerOptions) {
  const intervalMs = options.intervalMs ?? DEFAULT_CLIENT_HEARTBEAT_MS;
  const setIntervalFn = options.setIntervalFn ?? setInterval;
  const clearIntervalFn = options.clearIntervalFn ?? clearInterval;

  let timer: ReturnType<typeof setInterval> | number | null = null;
  let stopped = false;
  let inFlight = false;

  const beat = async () => {
    if (stopped || inFlight) return;
    if (!options.isVisible()) return;
    inFlight = true;
    try {
      await options.onHeartbeat();
    } finally {
      inFlight = false;
    }
  };

  const stopTimer = () => {
    if (timer != null) {
      clearIntervalFn(timer);
      timer = null;
    }
  };

  const start = () => {
    if (stopped) return;
    stopTimer();
    void beat();
    timer = setIntervalFn(() => {
      void beat();
    }, intervalMs);
  };

  const onVisibilityChange = () => {
    if (stopped) return;
    if (options.isVisible()) start();
    else stopTimer();
  };

  const stop = () => {
    stopped = true;
    stopTimer();
  };

  return {
    start,
    stop,
    onVisibilityChange,
    beat,
    isRunning: () => timer != null,
    isStopped: () => stopped,
  };
}
