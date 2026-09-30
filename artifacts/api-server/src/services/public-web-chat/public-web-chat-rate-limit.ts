import type { SupabaseClient } from "@supabase/supabase-js";

export type WebChatRateLimitDecision = {
  allowed: boolean;
  retryAfterSeconds: number;
};

/**
 * Storage abstraction for Public Web Chat rate limits.
 * Production uses the shared Postgres implementation (migration 402).
 * The in-memory store is for unit tests and explicit local fallbacks only.
 */
export interface WebChatRateLimitStore {
  readonly kind: "memory" | "shared";
  consume(key: string, limit: number, windowMs: number): Promise<WebChatRateLimitDecision>;
}

export class WebChatRateLimitStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebChatRateLimitStoreError";
  }
}

export const WEB_CHAT_RATE_LIMITS = {
  sessionCreatePerIp: { limit: 10, windowMs: 60_000 },
  sessionCreateBurstPerIp: { limit: 3, windowMs: 10_000 },
  messagePerSession: { limit: 20, windowMs: 60_000 },
  messageBurstPerSession: { limit: 12, windowMs: 10_000 },
  messagePerIp: { limit: 60, windowMs: 60_000 },
  messageBurstPerIp: { limit: 20, windowMs: 10_000 },
  readPerSession: { limit: 120, windowMs: 60_000 },
  readPerIp: { limit: 600, windowMs: 60_000 },
} as const;

/**
 * DEVELOPMENT / LOCAL ONLY.
 * Fixed-window counters in process memory: not shared across instances, reset on restart,
 * and NOT safe for multi-instance or production deployments.
 */
export function createInMemoryWebChatRateLimitStore(options: {
  now?: () => number;
  maxKeys?: number;
} = {}): WebChatRateLimitStore {
  const now = options.now ?? (() => Date.now());
  const maxKeys = options.maxKeys ?? 10_000;
  const windows = new Map<string, { windowStart: number; count: number; windowMs: number }>();

  const prune = (at: number) => {
    for (const [key, entry] of windows) {
      if (at - entry.windowStart >= entry.windowMs) windows.delete(key);
    }
    if (windows.size >= maxKeys) windows.clear();
  };

  return {
    kind: "memory",
    async consume(key, limit, windowMs) {
      const at = now();
      let entry = windows.get(key);
      if (!entry || at - entry.windowStart >= windowMs) {
        if (!entry && windows.size >= maxKeys) prune(at);
        entry = { windowStart: at, count: 0, windowMs };
        windows.set(key, entry);
      }
      entry.count += 1;
      if (entry.count > limit) {
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil((entry.windowStart + windowMs - at) / 1000)),
        };
      }
      return { allowed: true, retryAfterSeconds: 0 };
    },
  };
}

type RpcClient = Pick<SupabaseClient, "rpc">;

function parseDecision(data: unknown): WebChatRateLimitDecision {
  const row = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
  return {
    allowed: row.allowed === true,
    retryAfterSeconds: Number(row.retry_after_seconds ?? 0) || 0,
  };
}

/**
 * Shared Postgres store (public.web_chat_rate_limit_consume). Safe across api-server instances.
 * RPC failures throw — Public Web Chat maps that to 503 (fail closed).
 */
export function createSupabaseWebChatRateLimitStore(
  client: RpcClient,
  options: { keyPrefix?: string } = {},
): WebChatRateLimitStore {
  const prefix = options.keyPrefix ?? "";
  return {
    kind: "shared",
    async consume(key, limit, windowMs) {
      const { data, error } = await client.rpc("web_chat_rate_limit_consume", {
        p_bucket_key: `${prefix}${key}`,
        p_limit: limit,
        p_window_ms: windowMs,
      });
      if (error) {
        throw new WebChatRateLimitStoreError(error.message);
      }
      return parseDecision(data);
    },
  };
}
