import { readInstanceTarget } from "../lib/instance-url";
import { sessionFailureAction, type MobileSession } from "./session-policy";

export type { MobileSession };

export type KeyValueStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

export const SESSION_STORAGE_KEY = "valueor.mobile.session";

export type StoredMobileSession = {
  accessToken: string;
  refreshToken: string;
  remember: boolean;
  instanceHostname: string;
};

export type PasswordAuth = {
  signInWithPassword(input: { email: string; password: string }): Promise<{
    data: { session: { access_token: string; refresh_token: string } | null };
    error: { message: string } | null;
  }>;
  signOut(): Promise<void>;
  resetPasswordForEmail(email: string, options: { redirectTo: string }): Promise<{ error: { message: string } | null }>;
};

export type SignInDependencies = {
  apiUrl: string;
  auth: PasswordAuth;
  store: KeyValueStore;
  fetchImpl?: typeof fetch;
};

export type SignInResult =
  | { ok: true; session: MobileSession; tokens: StoredMobileSession }
  | { ok: false; code: string; message: string };

function parseSessionBody(body: unknown): MobileSession | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Partial<MobileSession>;
  if (record.scope !== "tenant" && record.scope !== "platform") return null;
  if (typeof record.userId !== "string" || !Array.isArray(record.permissions)) return null;
  return {
    scope: record.scope,
    isSuperAdmin: Boolean(record.isSuperAdmin),
    userId: record.userId,
    displayName: typeof record.displayName === "string" ? record.displayName : null,
    company: record.company && typeof record.company === "object" && typeof record.company.id === "string"
      ? record.company
      : null,
    permissions: record.permissions.filter((code): code is string => typeof code === "string"),
  };
}

export function validateLoginDraft(input: { instanceUrl: string; email: string; password: string }): "invalid_instance" | "empty_credentials" | "invalid_email" | null {
  if (!readInstanceTarget(input.instanceUrl)) return "invalid_instance";
  const email = input.email.trim();
  if (!email || !input.password) return "empty_credentials";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "invalid_email";
  return null;
}

export async function signInToInstance(
  deps: SignInDependencies,
  input: { instanceUrl: string; email: string; password: string; remember: boolean },
): Promise<SignInResult> {
  const target = readInstanceTarget(input.instanceUrl);
  if (!target) {
    return { ok: false, code: "invalid_instance", message: "Enter a company address such as https://acme.valueor.org." };
  }
  const signedIn = await deps.auth.signInWithPassword({
    email: input.email.trim(),
    password: input.password,
  });
  const accessToken = signedIn.data.session?.access_token;
  const refreshToken = signedIn.data.session?.refresh_token;
  if (signedIn.error || !accessToken || !refreshToken) {
    return { ok: false, code: "invalid_credentials", message: "Invalid credentials." };
  }

  const response = await (deps.fetchImpl ?? fetch)(`${deps.apiUrl}/api/mobile/session`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-ValueOR-Instance": target.hostname,
      Accept: "application/json",
    },
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    await deps.auth.signOut();
    const record = body && typeof body === "object" ? body as { code?: unknown; message?: unknown } : {};
    return {
      ok: false,
      code: typeof record.code === "string" ? record.code : "session_rejected",
      message: typeof record.message === "string" ? record.message : "Access denied for this company.",
    };
  }
  const session = parseSessionBody(body);
  if (!session) {
    await deps.auth.signOut();
    return { ok: false, code: "session_rejected", message: "Access denied for this company." };
  }
  const tokens: StoredMobileSession = {
    accessToken,
    refreshToken,
    remember: input.remember,
    instanceHostname: target.hostname,
  };
  if (input.remember) {
    await deps.store.setItem(SESSION_STORAGE_KEY, JSON.stringify(tokens));
  } else {
    await deps.store.removeItem(SESSION_STORAGE_KEY);
  }
  return { ok: true, session, tokens };
}

export async function restoreRememberedSession(store: KeyValueStore): Promise<StoredMobileSession | null> {
  const raw = await store.getItem(SESSION_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredMobileSession>;
    if (!parsed.remember || !parsed.accessToken || !parsed.refreshToken || !parsed.instanceHostname) {
      await store.removeItem(SESSION_STORAGE_KEY);
      return null;
    }
    return {
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
      remember: true,
      instanceHostname: parsed.instanceHostname,
    };
  } catch {
    await store.removeItem(SESSION_STORAGE_KEY);
    return null;
  }
}

export async function refreshMobileSession(
  deps: SignInDependencies,
  tokens: StoredMobileSession,
): Promise<SignInResult> {
  const response = await (deps.fetchImpl ?? fetch)(`${deps.apiUrl}/api/mobile/session`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${tokens.accessToken}`,
      "X-ValueOR-Instance": tokens.instanceHostname,
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    const action = sessionFailureAction(response.status);
    if (action === "sign_out") {
      await signOutMobileSession(deps);
    }
    const body: unknown = await response.json().catch(() => null);
    const record = body && typeof body === "object" ? body as { code?: unknown; message?: unknown } : {};
    return {
      ok: false,
      code: typeof record.code === "string" ? record.code : action,
      message: typeof record.message === "string" ? record.message : "Session expired.",
    };
  }
  const session = parseSessionBody(await response.json().catch(() => null));
  if (!session) {
    await signOutMobileSession(deps);
    return { ok: false, code: "session_rejected", message: "Access denied for this company." };
  }
  return { ok: true, session, tokens };
}

export async function requestPasswordReset(
  deps: Pick<SignInDependencies, "auth">,
  input: { instanceUrl: string; email: string },
): Promise<{ ok: true } | { ok: false; code: string; message: string }> {
  const target = readInstanceTarget(input.instanceUrl);
  if (!target) {
    return { ok: false, code: "invalid_instance", message: "Enter a company address such as https://acme.valueor.org." };
  }
  const result = await deps.auth.resetPasswordForEmail(input.email.trim(), {
    redirectTo: `${target.origin}/login`,
  });
  if (result.error) return { ok: false, code: "recovery_failed", message: "Password recovery could not be started." };
  return { ok: true };
}

export async function signOutMobileSession(deps: Pick<SignInDependencies, "auth" | "store">): Promise<void> {
  await deps.auth.signOut();
  await deps.store.removeItem(SESSION_STORAGE_KEY);
}

export function memoryStore(): KeyValueStore {
  const values = new Map<string, string>();
  return {
    async getItem(key) {
      return values.get(key) ?? null;
    },
    async setItem(key, value) {
      values.set(key, value);
    },
    async removeItem(key) {
      values.delete(key);
    },
  };
}
