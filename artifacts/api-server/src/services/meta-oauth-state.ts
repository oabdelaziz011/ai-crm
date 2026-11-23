import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const META_OAUTH_STATE_TTL_MS = 15 * 60 * 1000;

export class MetaOauthStateError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 400,
  ) {
    super(message);
    this.name = "MetaOauthStateError";
  }
}

export type MetaOauthStatePayload = {
  companyId: string;
  userId: string | null;
  flow: string;
  nonce: string;
  exp: number;
  /** Explicit reconnect: allows OAuth complete to replace an existing connection. */
  confirmReplaceExisting?: boolean;
};

export function resolveMetaOauthStateSecret(explicit?: string): string {
  const fromEnv =
    String(explicit ?? "").trim() ||
    String(process.env.META_INSTAGRAM_LOGIN_STATE_SECRET ?? "").trim() ||
    String(process.env.META_MESSENGER_OAUTH_STATE_SECRET ?? "").trim() ||
    String(process.env.META_PAGES_OAUTH_STATE_SECRET ?? "").trim() ||
    String(process.env.META_EMBEDDED_SIGNUP_STATE_SECRET ?? "").trim() ||
    String(process.env.META_EMBEDDED_SIGNUP_APP_SECRET ?? "").trim() ||
    String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!fromEnv) {
    throw new MetaOauthStateError(
      "Meta OAuth state signing secret is not configured.",
      "META_OAUTH_STATE_SECRET_MISSING",
      503,
    );
  }
  return fromEnv;
}

export function signMetaOauthState(payload: MetaOauthStatePayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyMetaOauthState(
  state: string,
  secret: string,
  expectedFlow: string,
  nowMs: number,
  expectedCompanyId?: string,
): MetaOauthStatePayload {
  const parts = state.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new MetaOauthStateError("Invalid Meta OAuth state.", "META_OAUTH_STATE_INVALID", 400);
  }
  const [body, sig] = parts;
  const expectedSig = createHmac("sha256", secret).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new MetaOauthStateError(
      "Invalid Meta OAuth state signature.",
      "META_OAUTH_STATE_INVALID",
      400,
    );
  }
  let payload: MetaOauthStatePayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as MetaOauthStatePayload;
  } catch {
    throw new MetaOauthStateError(
      "Invalid Meta OAuth state payload.",
      "META_OAUTH_STATE_INVALID",
      400,
    );
  }
  if (payload.flow !== expectedFlow) {
    throw new MetaOauthStateError("OAuth state flow mismatch.", "META_OAUTH_STATE_FLOW_MISMATCH", 400);
  }
  if (!payload.exp || payload.exp < nowMs) {
    throw new MetaOauthStateError("Meta OAuth state expired.", "META_OAUTH_STATE_EXPIRED", 400);
  }
  if (
    expectedCompanyId &&
    String(payload.companyId).toLowerCase() !== expectedCompanyId.toLowerCase()
  ) {
    throw new MetaOauthStateError(
      "OAuth state company mismatch.",
      "META_OAUTH_STATE_COMPANY_MISMATCH",
      403,
    );
  }
  return payload;
}

export function createMetaOauthState(input: {
  companyId: string;
  userId: string | null;
  flow: string;
  secret: string;
  nowMs?: number;
  confirmReplaceExisting?: boolean;
}): string {
  const nowMs = input.nowMs ?? Date.now();
  return signMetaOauthState(
    {
      companyId: input.companyId,
      userId: input.userId,
      flow: input.flow,
      nonce: randomBytes(16).toString("hex"),
      exp: nowMs + META_OAUTH_STATE_TTL_MS,
      ...(input.confirmReplaceExisting ? { confirmReplaceExisting: true } : {}),
    },
    input.secret,
  );
}

export function resolvePublicApiBaseUrl(): string {
  const raw =
    String(process.env.META_OAUTH_PUBLIC_API_BASE_URL ?? "").trim() ||
    String(process.env.PUBLIC_API_BASE_URL ?? "").trim() ||
    String(process.env.VITE_API_SERVER_URL ?? "").trim() ||
    `http://127.0.0.1:${String(process.env.PORT ?? "3010").trim() || "3010"}`;
  return raw.replace(/\/$/, "");
}

export function resolveLoginAppBaseUrl(): string {
  const raw =
    String(process.env.LOGIN_APP_URL ?? "").trim() ||
    String(process.env.VITE_APP_ORIGIN ?? "").trim() ||
    String(process.env.FRONTEND_ORIGIN ?? "").trim() ||
    "http://localhost:5180";
  return raw.replace(/\/$/, "");
}

export function sanitizeGraphVersion(version: string | undefined | null): string {
  const trimmed = String(version ?? "").trim();
  if (!trimmed) return "v21.0";
  return trimmed.startsWith("v") ? trimmed : `v${trimmed}`;
}
