const seen = new Map<string, number>();
const TTL_MS = 10 * 60 * 1000;

/** In-memory replay protection — production uses DB unique constraint on event_id. */
export function isReplay(eventId: string, subscriptionId: string): boolean {
  const key = `${subscriptionId}:${eventId}`;
  const now = Date.now();
  prune(now);
  if (seen.has(key)) return true;
  seen.set(key, now);
  return false;
}

function prune(now: number) {
  for (const [key, ts] of seen) {
    if (now - ts > TTL_MS) seen.delete(key);
  }
}

export function resetReplayCache() {
  seen.clear();
}
