/**
 * Device push registration. The company id is the trusted tenant, never the body.
 * This module does not call Expo and does not send a notification.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadPlatformEnv } from "../config/env.js";

const TOKEN = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$/;
const PLATFORMS = new Set(["ios", "android", "unknown"]);

export type PushRegistration =
  | { ok: false; status: number; code: string; message: string }
  | { ok: true; token: string; platform: "ios" | "android" | "unknown"; deviceName: string | null };

export type PushDeviceRow = {
  id: string;
  userId: string;
  companyId: string;
  token: string;
  platform: "ios" | "android" | "unknown";
  deviceName: string | null;
  revokedAt: string | null;
};

const PUSH_RESOURCES = new Set([
  "customer",
  "lead",
  "opportunity",
  "conversation",
  "ticket",
  "email",
  "notification",
]);

const PUSH_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PushPreferenceGate = {
  userId: string | null;
  channel: string | null;
  muted: boolean;
};

export type PushDeliveryDecision = {
  status: number;
  code: "delivery_unverified" | "validation_error" | "cross_tenant" | "notification_muted" | "tenant_required";
  message: string;
  delivered: false;
};

/**
 * Authorizes a future push payload. An allowed payload still returns
 * delivery_unverified because Expo delivery has not been verified.
 */
export function decidePushDelivery(input?: {
  recipientUserId: string;
  sessionCompanyId: string | null;
  payload: { resource?: unknown; id?: unknown; companyId?: unknown };
  preferences?: PushPreferenceGate[];
}): PushDeliveryDecision {
  const unverified: PushDeliveryDecision = {
    status: 501,
    code: "delivery_unverified",
    message: "Push delivery is not configured, so no notification was sent.",
    delivered: false,
  };
  if (!input) return unverified;
  if (!input.sessionCompanyId) {
    return { status: 403, code: "tenant_required", message: "A company workspace is required.", delivered: false };
  }
  const resource = typeof input.payload.resource === "string" ? input.payload.resource : "";
  const id = typeof input.payload.id === "string" ? input.payload.id : "";
  const claimedCompany = typeof input.payload.companyId === "string" ? input.payload.companyId : "";
  if (!PUSH_RESOURCES.has(resource) || !PUSH_UUID.test(id) || !input.recipientUserId) {
    return { status: 400, code: "validation_error", message: "The notification destination is not valid.", delivered: false };
  }
  if (claimedCompany && claimedCompany !== input.sessionCompanyId) {
    return { status: 403, code: "cross_tenant", message: "Access denied for this company.", delivered: false };
  }
  const muted = (input.preferences ?? []).some((preference) => (
    preference.muted
    && (preference.channel == null || preference.channel === "push")
    && (preference.userId == null || preference.userId === input.recipientUserId)
  ));
  if (muted) {
    return { status: 403, code: "notification_muted", message: "Push notifications are muted for this user.", delivered: false };
  }
  return unverified;
}

/**
 * Device storage depends on public.mobile_push_devices (migration 446).
 * When that table is absent, registration and revocation return this body
 * so a missing relation cannot fail startup or any other mobile route.
 * Delivery stays unverified even when storage is present.
 */
export function pushStorageBlockedResponse(): {
  status: 503;
  body: {
    ok: false;
    code: "push_storage_unavailable";
    message: string;
    stored: false;
    revoked: false;
    delivered: false;
  };
} {
  return {
    status: 503,
    body: {
      ok: false,
      code: "push_storage_unavailable",
      message: "Push device storage is not available until its database migration is approved.",
      stored: false,
      revoked: false,
      delivered: false,
    },
  };
}

export function isPushStorageMissingError(error: unknown): boolean {
  const message = error instanceof Error
    ? error.message
    : typeof error === "string"
      ? error
      : error && typeof error === "object" && "message" in error
        ? String((error as { message?: unknown }).message ?? "")
        : "";
  const code = error && typeof error === "object" && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : "";
  if (/permission denied|row-level security|rls/i.test(message)) return false;
  return (
    code === "42P01"
    || /Could not find the table ['"]?public\.mobile_push_devices/i.test(message)
    || /relation ['"]?public\.mobile_push_devices['"]? does not exist/i.test(message)
    || /relation ['"]?mobile_push_devices['"]? does not exist/i.test(message)
    || (/mobile_push_devices/i.test(message) && /schema cache|does not exist|undefined_table/i.test(message))
  );
}

export function decidePushRegistration(body: unknown, sessionCompanyId: string | null): PushRegistration {
  if (!sessionCompanyId) {
    return { ok: false, status: 403, code: "tenant_required", message: "A company workspace is required." };
  }
  const record = body && typeof body === "object" ? body as Record<string, unknown> : { token: body };
  const claimed = typeof record.companyId === "string" ? record.companyId.trim() : "";
  if (claimed && claimed !== sessionCompanyId) {
    return { ok: false, status: 403, code: "cross_tenant", message: "Access denied for this company." };
  }
  const token = typeof record.token === "string" ? record.token.trim() : "";
  if (!TOKEN.test(token)) {
    return { ok: false, status: 400, code: "invalid_push_token", message: "A device push token is required." };
  }
  const platformRaw = typeof record.platform === "string" ? record.platform.trim().toLowerCase() : "unknown";
  const platform = PLATFORMS.has(platformRaw) ? platformRaw as "ios" | "android" | "unknown" : "unknown";
  const deviceName = typeof record.deviceName === "string" ? record.deviceName.trim().slice(0, 80) || null : null;
  return { ok: true, token, platform, deviceName };
}

/** One active row per Expo token. Refreshing the same device does not add a second row. */
export function applyPushRegistration(rows: PushDeviceRow[], input: {
  id: string;
  userId: string;
  companyId: string;
  token: string;
  platform: PushDeviceRow["platform"];
  deviceName: string | null;
  now: string;
}): { rows: PushDeviceRow[]; duplicate: boolean } {
  const next = rows.map((row) => (
    row.token === input.token && row.revokedAt == null && (row.userId !== input.userId || row.companyId !== input.companyId)
      ? { ...row, revokedAt: input.now }
      : row
  ));
  const own = next.find((row) => row.userId === input.userId && row.companyId === input.companyId && row.token === input.token);
  if (own) {
    own.revokedAt = null;
    own.platform = input.platform;
    own.deviceName = input.deviceName;
    return { rows: next, duplicate: true };
  }
  next.push({
    id: input.id,
    userId: input.userId,
    companyId: input.companyId,
    token: input.token,
    platform: input.platform,
    deviceName: input.deviceName,
    revokedAt: null,
  });
  return { rows: next, duplicate: false };
}

export function pushRegistryClient(): SupabaseClient {
  const env = loadPlatformEnv();
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
    throw new Error("push_registry_unconfigured");
  }
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function failed(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export async function savePushRegistration(client: SupabaseClient, input: {
  userId: string;
  companyId: string;
  token: string;
  platform: PushDeviceRow["platform"];
  deviceName: string | null;
}): Promise<{ duplicate: boolean }> {
  const now = new Date().toISOString();
  const revoked = await client
    .from("mobile_push_devices")
    .update({ revoked_at: now, updated_at: now })
    .eq("expo_push_token", input.token)
    .is("revoked_at", null)
    .or(`user_id.neq.${input.userId},company_id.neq.${input.companyId}`);
  failed(revoked.error);
  const existing = await client
    .from("mobile_push_devices")
    .select("id")
    .eq("user_id", input.userId)
    .eq("company_id", input.companyId)
    .eq("expo_push_token", input.token)
    .maybeSingle();
  failed(existing.error);
  if (existing.data?.id) {
    const refreshed = await client
      .from("mobile_push_devices")
      .update({
        revoked_at: null,
        platform: input.platform,
        device_name: input.deviceName,
        last_seen_at: now,
        updated_at: now,
      })
      .eq("id", existing.data.id)
      .eq("user_id", input.userId)
      .eq("company_id", input.companyId);
    failed(refreshed.error);
    return { duplicate: true };
  }
  const inserted = await client.from("mobile_push_devices").insert({
    user_id: input.userId,
    company_id: input.companyId,
    expo_push_token: input.token,
    platform: input.platform,
    device_name: input.deviceName,
    revoked_at: null,
    last_seen_at: now,
    updated_at: now,
  }).select("id").single();
  failed(inserted.error);
  return { duplicate: false };
}

export async function revokeStoredPushRegistrations(client: SupabaseClient, userId: string, companyId: string): Promise<void> {
  const now = new Date().toISOString();
  const revoked = await client
    .from("mobile_push_devices")
    .update({ revoked_at: now, updated_at: now })
    .eq("user_id", userId)
    .eq("company_id", companyId)
    .is("revoked_at", null);
  failed(revoked.error);
}

export function revokePushRegistrations(rows: PushDeviceRow[], userId: string, companyId: string, now: string): PushDeviceRow[] {
  return rows.map((row) => (
    row.userId === userId && row.companyId === companyId && row.revokedAt == null
      ? { ...row, revokedAt: now }
      : row
  ));
}
