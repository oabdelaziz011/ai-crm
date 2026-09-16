const RELOAD_GUARD_KEY = "vor.stale-dynamic-import.reload";

/** Chrome caches a failed ESM import for the life of the document. */
export function isStaleDynamicImportError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /Failed to fetch dynamically imported module/i.test(message);
}

export function recoverStaleDynamicImportOnce(): boolean {
  if (typeof window === "undefined" || typeof sessionStorage === "undefined") {
    return false;
  }
  try {
    if (sessionStorage.getItem(RELOAD_GUARD_KEY) === "1") {
      return false;
    }
    sessionStorage.setItem(RELOAD_GUARD_KEY, "1");
    window.location.reload();
    return true;
  } catch {
    return false;
  }
}

export function clearStaleDynamicImportReloadGuard(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(RELOAD_GUARD_KEY);
  } catch {
    // private mode / quota
  }
}
