import { randomUUID } from "node:crypto";

/**
 * Shared WhatsApp conversation turn lease.
 * The in-memory queue only orders turns inside one process.
 * Sending requires this lock. A Postgres error is not treated as ownership.
 */

export type WhatsAppConversationTurnLock = {
  acquire(input: { conversationId: string; owner: string; ttlMs: number }): Promise<boolean>;
  renew(input: { conversationId: string; owner: string; ttlMs: number }): Promise<boolean>;
  release(input: { conversationId: string; owner: string }): Promise<boolean>;
};

export type OpenWhatsAppSharedTurn = {
  stillOwns: () => boolean;
  confirmOwns: () => Promise<boolean>;
  release: () => Promise<void>;
};

type RpcClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message?: string } | null }>;
};

function assertOwned(data: unknown, error: { message?: string } | null): boolean {
  if (error || (data !== true && data !== false)) {
    throw new Error("conversation_turn_lock_unavailable");
  }
  return data;
}

export function createSupabaseWhatsAppConversationTurnLock(client: RpcClient): WhatsAppConversationTurnLock {
  return {
    async acquire(input) {
      const { data, error } = await client.rpc("acquire_whatsapp_conversation_turn", {
        p_conversation_id: input.conversationId,
        p_owner: input.owner,
        p_ttl_ms: input.ttlMs,
      });
      return assertOwned(data, error);
    },
    async renew(input) {
      const { data, error } = await client.rpc("renew_whatsapp_conversation_turn", {
        p_conversation_id: input.conversationId,
        p_owner: input.owner,
        p_ttl_ms: input.ttlMs,
      });
      return assertOwned(data, error);
    },
    async release(input) {
      const { data, error } = await client.rpc("release_whatsapp_conversation_turn", {
        p_conversation_id: input.conversationId,
        p_owner: input.owner,
      });
      return assertOwned(data, error);
    },
  };
}

/** Explicit single-process double for unit tests. Production does not use this when Postgres fails. */
export function createMemoryWhatsAppConversationTurnLock(): WhatsAppConversationTurnLock {
  const rows = new Map<string, { owner: string; expiresAt: number }>();
  return {
    async acquire(input) {
      const current = rows.get(input.conversationId);
      if (current && current.expiresAt > Date.now() && current.owner !== input.owner) return false;
      rows.set(input.conversationId, { owner: input.owner, expiresAt: Date.now() + input.ttlMs });
      return true;
    },
    async renew(input) {
      const current = rows.get(input.conversationId);
      if (!current || current.owner !== input.owner || current.expiresAt <= Date.now()) return false;
      current.expiresAt = Date.now() + input.ttlMs;
      return true;
    },
    async release(input) {
      const current = rows.get(input.conversationId);
      if (!current || current.owner !== input.owner) return false;
      rows.delete(input.conversationId);
      return true;
    },
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

/**
 * Waits until this owner holds the shared lease. A store error throws
 * conversation_turn_lock_unavailable instead of pretending the turn is held.
 */
export async function openWhatsAppSharedTurnLock(
  lock: WhatsAppConversationTurnLock,
  conversationId: string,
  ttlMs: number,
): Promise<OpenWhatsAppSharedTurn> {
  const owner = randomUUID();
  for (;;) {
    let acquired = false;
    try {
      acquired = await lock.acquire({ conversationId, owner, ttlMs });
    } catch {
      throw new Error("conversation_turn_lock_unavailable");
    }
    if (acquired) break;
    await delay(25);
  }

  let owned = true;
  const renewEvery = Math.max(20, Math.floor(ttlMs / 3));
  const renewTimer = setInterval(() => {
    void lock.renew({ conversationId, owner, ttlMs }).then(
      (ok) => {
        if (!ok) owned = false;
      },
      () => {
        owned = false;
      },
    );
  }, renewEvery);
  renewTimer.unref?.();

  return {
    stillOwns: () => owned,
    confirmOwns: async () => {
      try {
        owned = await lock.renew({ conversationId, owner, ttlMs });
      } catch {
        owned = false;
      }
      return owned;
    },
    release: async () => {
      clearInterval(renewTimer);
      owned = false;
      try {
        await lock.release({ conversationId, owner });
      } catch {
        // A failed release must not be reported as continued ownership.
      }
    },
  };
}
