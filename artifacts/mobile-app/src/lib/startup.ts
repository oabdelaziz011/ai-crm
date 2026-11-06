import { textDirection, type AppLanguage } from "../i18n/catalog";
import { languageChangePlan, readPendingDirection, type LayoutDirection } from "../i18n/direction";

export const STARTUP_DEADLINE_MS = 8000;

export class StartupTimeout extends Error {
  constructor() {
    super("startup_timeout");
  }
}

/** Startup applies direction in place. A language change owns the single native reload. */
export function startupDirectionPlan(input: {
  language: AppLanguage;
  isRTL: boolean;
  pendingReload: LayoutDirection | null;
}): { reload: false; forceRTL: boolean | null; clearPending: boolean } {
  const plan = languageChangePlan({
    current: null,
    next: input.language,
    isRTL: input.isRTL,
    pendingReload: input.pendingReload,
    persisted: true,
  });
  const nativeMatches = input.isRTL === (textDirection(input.language) === "rtl");
  return {
    reload: false,
    forceRTL: nativeMatches ? null : plan.forceRTL,
    clearPending: nativeMatches && input.pendingReload != null,
  };
}

export function withDeadline<T>(work: Promise<T>, deadlineMs = STARTUP_DEADLINE_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new StartupTimeout()), deadlineMs);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error("startup_failed"));
      },
    );
  });
}

export type SessionLoadResult<T> =
  | { ok: true; session: T }
  | { ok: false; failure: "auth" | "unavailable" };

export type RestoredMobileSession<T> =
  | { outcome: "none"; session: null; hostname: null }
  | { outcome: "restored"; session: T; hostname: string }
  | { outcome: "unavailable"; session: null; hostname: string };

export async function restoreMobileSession<T>(input: {
  readAccessToken: () => Promise<string | null>;
  readHostname: () => Promise<string | null>;
  loadSession: (credentials: { accessToken: string; hostname: string }) => Promise<SessionLoadResult<T>>;
  signOut: () => Promise<void>;
  clearHostname: () => Promise<void>;
}): Promise<RestoredMobileSession<T>> {
  const hostname = await input.readHostname();
  if (!hostname) return { outcome: "none", session: null, hostname: null };
  const accessToken = await input.readAccessToken();
  if (!accessToken) {
    await input.clearHostname();
    return { outcome: "none", session: null, hostname: null };
  }
  const loaded = await input.loadSession({ accessToken, hostname });
  if (loaded.ok) return { outcome: "restored", session: loaded.session, hostname };
  if (loaded.failure === "auth") {
    await input.signOut();
    await input.clearHostname();
    return { outcome: "none", session: null, hostname: null };
  }
  return { outcome: "unavailable", session: null, hostname };
}

export function storedLanguage(value: string | null): AppLanguage {
  return value === "ar" || value === "de" || value === "en" ? value : "en";
}

export { readPendingDirection };
