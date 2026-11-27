/**
 * Browser-side login attempt throttle.
 * Limits failed password attempts per email so repeated wrong logins
 * do not hammer Supabase Auth / the browser tab.
 * Persistence is sessionStorage so refresh cannot instantly reset the lockout.
 */

const STORAGE_KEY = "valueor.login.fail.v1";
const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60_000;

type FailBucket = {
  failures: number[];
};

function readAll(): Record<string, FailBucket> {
  if (typeof sessionStorage === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, FailBucket>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(data: Record<string, FailBucket>): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* quota / private mode — in-memory fallthrough is still better than crashing */
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function prune(failures: number[], now: number): number[] {
  return failures.filter((t) => now - t < WINDOW_MS);
}

export type LoginRateLimitStatus = {
  allowed: boolean;
  retryAfterSeconds: number;
  failureCount: number;
};

export function getLoginRateLimitStatus(email: string): LoginRateLimitStatus {
  const key = normalizeEmail(email);
  if (!key) {
    return { allowed: true, retryAfterSeconds: 0, failureCount: 0 };
  }
  const now = Date.now();
  const all = readAll();
  const failures = prune(all[key]?.failures ?? [], now);
  if (failures.length >= MAX_FAILURES) {
    const oldest = Math.min(...failures);
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + WINDOW_MS - now) / 1000));
    return { allowed: false, retryAfterSeconds, failureCount: failures.length };
  }
  return { allowed: true, retryAfterSeconds: 0, failureCount: failures.length };
}

export function recordLoginFailure(email: string): LoginRateLimitStatus {
  const key = normalizeEmail(email);
  if (!key) {
    return { allowed: true, retryAfterSeconds: 0, failureCount: 0 };
  }
  const now = Date.now();
  const all = readAll();
  const failures = prune(all[key]?.failures ?? [], now);
  failures.push(now);
  all[key] = { failures };
  writeAll(all);
  return getLoginRateLimitStatus(key);
}

export function clearLoginFailures(email: string): void {
  const key = normalizeEmail(email);
  if (!key) return;
  const all = readAll();
  if (!(key in all)) return;
  delete all[key];
  writeAll(all);
}
