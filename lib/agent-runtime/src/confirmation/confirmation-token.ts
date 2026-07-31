import type { ConfirmationTokenRecord } from "./confirmation-types.js";
import type { AgentMemoryState } from "../types.js";

export const CONFIRMATION_TOKEN_TTL_MS = 15 * 60 * 1000;

export type ConfirmationTokenValidation =
  | { valid: true }
  | { valid: false; code: string; message: string };

function randomToken(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 24);
}

export function createConfirmationToken(input: {
  workflowId: string;
  taskId: string;
  toolKey: string;
  userId: string | null;
  companyId: string;
  now?: Date;
  ttlMs?: number;
}): ConfirmationTokenRecord {
  const now = input.now ?? new Date();
  const ttlMs = input.ttlMs ?? CONFIRMATION_TOKEN_TTL_MS;
  const issuedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + ttlMs).toISOString();

  return {
    token: randomToken(),
    workflowId: input.workflowId,
    taskId: input.taskId,
    toolKey: input.toolKey,
    userId: input.userId,
    companyId: input.companyId,
    issuedAt,
    expiresAt,
    consumedAt: null,
  };
}

export function validateConfirmationToken(
  record: ConfirmationTokenRecord,
  input: {
    token: string;
    workflowId: string;
    taskId: string;
    toolKey: string;
    userId: string | null;
    isSuperAdmin?: boolean;
    workflowUserId?: string | null;
    now?: Date;
  },
): ConfirmationTokenValidation {
  const now = input.now ?? new Date();

  if (record.token !== input.token) {
    return { valid: false, code: "CONFIRMATION_TOKEN_INVALID", message: "Confirmation token mismatch." };
  }
  if (record.workflowId !== input.workflowId) {
    return { valid: false, code: "CONFIRMATION_TOKEN_INVALID", message: "Confirmation token is not valid for this workflow." };
  }
  if (record.taskId !== input.taskId) {
    return { valid: false, code: "CONFIRMATION_TOKEN_INVALID", message: "Confirmation token is not valid for this task." };
  }
  if (record.toolKey !== input.toolKey) {
    return { valid: false, code: "CONFIRMATION_TOKEN_INVALID", message: "Confirmation token is not valid for this tool." };
  }
  if (record.consumedAt) {
    return {
      valid: false,
      code: "CONFIRMATION_TOKEN_REUSED",
      message: "Confirmation token has already been used.",
    };
  }
  if (new Date(record.expiresAt) <= now) {
    return {
      valid: false,
      code: "CONFIRMATION_TOKEN_EXPIRED",
      message: "Confirmation token has expired.",
    };
  }

  if (!input.isSuperAdmin) {
    const authorizedUserId = record.userId ?? input.workflowUserId ?? null;
    if (authorizedUserId && input.userId !== authorizedUserId) {
      return {
        valid: false,
        code: "CONFIRMATION_UNAUTHORIZED",
        message: "You are not authorized to confirm this action.",
      };
    }
  }

  return { valid: true };
}

export function consumeConfirmationToken(
  record: ConfirmationTokenRecord,
  now?: Date,
): ConfirmationTokenRecord {
  return {
    ...record,
    consumedAt: (now ?? new Date()).toISOString(),
  };
}

export const CONFIRMATION_TOKEN_STORE_KEY = "confirmationTokens";
export const CONFIRMATION_INVALIDATED_KEY = "confirmationInvalidated";

export function getConfirmationTokenStore(
  memory: { executionState: Record<string, unknown> },
): Record<string, ConfirmationTokenRecord> {
  const store = memory.executionState[CONFIRMATION_TOKEN_STORE_KEY];
  if (store && typeof store === "object" && !Array.isArray(store)) {
    return store as Record<string, ConfirmationTokenRecord>;
  }
  return {};
}

export function isConfirmationInvalidated(memory: { executionState: Record<string, unknown> }): boolean {
  return memory.executionState[CONFIRMATION_INVALIDATED_KEY] === true;
}

export function invalidateAllConfirmationTokens(
  memory: AgentMemoryState,
  now?: Date,
): AgentMemoryState {
  const store = getConfirmationTokenStore(memory);
  const consumedAt = (now ?? new Date()).toISOString();
  const invalidatedStore: Record<string, ConfirmationTokenRecord> = {};

  for (const [key, record] of Object.entries(store)) {
    invalidatedStore[key] = { ...record, consumedAt };
  }

  const { pendingConfirmation: _removed, ...restExecutionState } = memory.executionState;

  return {
    ...memory,
    executionState: {
      ...restExecutionState,
      [CONFIRMATION_TOKEN_STORE_KEY]: invalidatedStore,
      [CONFIRMATION_INVALIDATED_KEY]: true,
    },
  };
}
