/** Prefer explicit app origin so auth emails never target the api-server port. */
function resolveAuthOrigin(): string {
  const configured = String(import.meta.env.VITE_APP_ORIGIN ?? "").trim().replace(/\/$/, "");
  if (configured) {
    return configured;
  }
  if (typeof window !== "undefined" && window.location?.origin) {
    const { origin, port } = window.location;
    // Guard: if the SPA is somehow opened via the API host, still point emails at Vite.
    if (port === "3000") {
      return "http://localhost:5173";
    }
    return origin;
  }
  return "http://localhost:5173";
}

/** Build an absolute redirect URL for Supabase auth emails (works on mobile browsers). */
export function getAuthRedirectUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const basePath = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
  return `${resolveAuthOrigin()}${basePath}${normalizedPath}`;
}

export const AUTH_CALLBACK_PATH = "/auth/callback";
export const RESET_PASSWORD_PATH = "/reset-password";

const PENDING_PASSWORD_SETUP_KEY = "auth_pending_password_setup";
const CALLBACK_NEXT_KEY = "auth_callback_next";

/** Canonical redirect for invite + password recovery emails (PKCE + implicit). */
export function getPasswordSetupCallbackUrl(): string {
  const next = encodeURIComponent(RESET_PASSWORD_PATH);
  return getAuthRedirectUrl(`${AUTH_CALLBACK_PATH}?next=${next}`);
}

export function rememberPasswordSetupIntent(): void {
  if (typeof window === "undefined") {
    return;
  }
  sessionStorage.setItem(PENDING_PASSWORD_SETUP_KEY, "1");
  sessionStorage.setItem(CALLBACK_NEXT_KEY, RESET_PASSWORD_PATH);
}

export function clearPasswordSetupIntent(): void {
  if (typeof window === "undefined") {
    return;
  }
  sessionStorage.removeItem(PENDING_PASSWORD_SETUP_KEY);
  sessionStorage.removeItem(CALLBACK_NEXT_KEY);
}

export function hasPendingPasswordSetupIntent(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return sessionStorage.getItem(PENDING_PASSWORD_SETUP_KEY) === "1";
}

export function getStoredAuthCallbackNextPath(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  const next = sessionStorage.getItem(CALLBACK_NEXT_KEY);
  return next && next.startsWith("/") ? next : null;
}

export function persistAuthCallbackNextPath(nextPath: string): void {
  if (typeof window === "undefined" || !nextPath.startsWith("/")) {
    return;
  }
  sessionStorage.setItem(CALLBACK_NEXT_KEY, nextPath);
}

export function getAuthTypeFromUrl(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const queryParams = new URLSearchParams(window.location.search);
  return hashParams.get("type") ?? queryParams.get("type");
}

export function getAuthCallbackNextPath(): string {
  if (typeof window === "undefined") {
    return "/dashboard";
  }

  const params = new URLSearchParams(window.location.search);
  const queryNext = params.get("next");
  if (queryNext && queryNext.startsWith("/")) {
    persistAuthCallbackNextPath(queryNext);
    return queryNext;
  }

  return getStoredAuthCallbackNextPath() ?? "/dashboard";
}

export function shouldRouteToPasswordSetup(event: string | null, nextPath: string): boolean {
  if (hasPendingPasswordSetupIntent()) {
    return true;
  }

  if (nextPath === RESET_PASSWORD_PATH) {
    return true;
  }

  const authType = getAuthTypeFromUrl();
  return (
    event === "PASSWORD_RECOVERY" ||
    authType === "recovery" ||
    authType === "invite" ||
    authType === "signup"
  );
}

export function isPublicAuthPath(path: string): boolean {
  return (
    path === "/login" ||
    path === "/register" ||
    path === "/forgot-password" ||
    path === AUTH_CALLBACK_PATH ||
    path === RESET_PASSWORD_PATH
  );
}
