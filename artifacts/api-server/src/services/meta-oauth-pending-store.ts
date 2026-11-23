import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { META_OAUTH_STATE_TTL_MS } from "./meta-oauth-state.js";

export type MetaOauthPendingFlow =
  | "messenger_facebook_login"
  | "instagram_login"
  | "meta_pages_oauth";

export type MetaOauthPendingRecord<T> = {
  companyId: string;
  flow: MetaOauthPendingFlow;
  payload: T;
  expiresAtMs: number;
};

/** Process-local fallback when DB is unavailable (unit tests / single-instance). */
const memoryPending = new Map<string, MetaOauthPendingRecord<unknown>>();

export function hashMetaOauthState(state: string): string {
  return createHash("sha256").update(state, "utf8").digest("hex");
}

function purgeExpiredMemory(nowMs: number): void {
  for (const [key, value] of memoryPending) {
    if (value.expiresAtMs < nowMs) memoryPending.delete(key);
  }
}

export async function putMetaOauthPendingSession<T>(input: {
  client?: SupabaseClient | null;
  state: string;
  companyId: string;
  flow: MetaOauthPendingFlow;
  payload: T;
  nowMs: number;
  ttlMs?: number;
}): Promise<void> {
  const ttl = input.ttlMs ?? META_OAUTH_STATE_TTL_MS;
  const expiresAtMs = input.nowMs + ttl;
  const stateHash = hashMetaOauthState(input.state);
  const record: MetaOauthPendingRecord<T> = {
    companyId: input.companyId.trim().toLowerCase(),
    flow: input.flow,
    payload: input.payload,
    expiresAtMs,
  };

  memoryPending.set(stateHash, record as MetaOauthPendingRecord<unknown>);

  if (!input.client) return;

  const { error } = await input.client.from("meta_oauth_pending_sessions").upsert(
    {
      state_hash: stateHash,
      company_id: input.companyId,
      flow: input.flow,
      payload: input.payload as unknown as Record<string, unknown>,
      expires_at: new Date(expiresAtMs).toISOString(),
    },
    { onConflict: "state_hash" },
  );
  if (error) {
    // Durable write failed — memory copy remains for this process only.
    console.warn("[meta-oauth-pending] durable put failed", error.message.slice(0, 120));
  }
}

export async function takeMetaOauthPendingSession<T>(input: {
  client?: SupabaseClient | null;
  state: string;
  companyId: string;
  flow: MetaOauthPendingFlow;
  nowMs: number;
  consume?: boolean;
}): Promise<T | null> {
  const stateHash = hashMetaOauthState(input.state);
  const companyId = input.companyId.trim().toLowerCase();
  const consume = input.consume !== false;
  purgeExpiredMemory(input.nowMs);

  const fromMemory = memoryPending.get(stateHash) as MetaOauthPendingRecord<T> | undefined;
  if (fromMemory) {
    if (fromMemory.expiresAtMs < input.nowMs) {
      memoryPending.delete(stateHash);
    } else if (fromMemory.companyId !== companyId) {
      throw Object.assign(new Error("OAuth pending session company mismatch."), {
        code: "META_OAUTH_PENDING_COMPANY_MISMATCH",
        statusCode: 403,
      });
    } else if (fromMemory.flow !== input.flow) {
      throw Object.assign(new Error("OAuth pending session flow mismatch."), {
        code: "META_OAUTH_PENDING_FLOW_MISMATCH",
        statusCode: 400,
      });
    } else {
      if (consume) memoryPending.delete(stateHash);
      if (input.client && consume) {
        await input.client.from("meta_oauth_pending_sessions").delete().eq("state_hash", stateHash);
      }
      return fromMemory.payload;
    }
  }

  if (!input.client) return null;

  const { data, error } = await input.client
    .from("meta_oauth_pending_sessions")
    .select("company_id,flow,payload,expires_at")
    .eq("state_hash", stateHash)
    .maybeSingle();
  if (error || !data) return null;

  const expiresAtMs = new Date(String(data.expires_at)).getTime();
  if (!Number.isFinite(expiresAtMs) || expiresAtMs < input.nowMs) {
    await input.client.from("meta_oauth_pending_sessions").delete().eq("state_hash", stateHash);
    return null;
  }
  if (String(data.company_id).trim().toLowerCase() !== companyId) {
    throw Object.assign(new Error("OAuth pending session company mismatch."), {
      code: "META_OAUTH_PENDING_COMPANY_MISMATCH",
      statusCode: 403,
    });
  }
  if (String(data.flow) !== input.flow) {
    throw Object.assign(new Error("OAuth pending session flow mismatch."), {
      code: "META_OAUTH_PENDING_FLOW_MISMATCH",
      statusCode: 400,
    });
  }
  if (consume) {
    await input.client.from("meta_oauth_pending_sessions").delete().eq("state_hash", stateHash);
  }
  return data.payload as T;
}

export async function clearMetaOauthPendingSession(input: {
  client?: SupabaseClient | null;
  state: string;
}): Promise<void> {
  const stateHash = hashMetaOauthState(input.state);
  memoryPending.delete(stateHash);
  if (!input.client) return;
  await input.client.from("meta_oauth_pending_sessions").delete().eq("state_hash", stateHash);
}

/** Test helper */
export function __clearMetaOauthPendingMemoryForTests(): void {
  memoryPending.clear();
}
