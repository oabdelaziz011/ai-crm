/**
 * Periodic confirm-only reconciliation for WhatsApp replies left in preparing/dispatching.
 * Does not call a provider. Disabled unless WHATSAPP_REPLY_RECOVERY_WORKER_ENABLED is set.
 * A restart starts the timer again only when that flag is on; the tick itself is idempotent.
 */
import type { ConfirmOutgoingDeliveryFn } from "../services/confirm-outgoing-delivery.js";
import {
  planStuckWhatsAppReplyRecovery,
  type StuckWhatsAppReply,
  type StuckWhatsAppReplyDecision,
} from "../services/reconcile-stuck-whatsapp-replies.js";

export type WhatsAppReplyRecoveryWorkerHandle = {
  stop: () => void;
  isRunning: () => boolean;
  isStopped: () => boolean;
};

export type WhatsAppReplyRecoveryWorkerDeps = {
  listStuck: () => Promise<StuckWhatsAppReply[]>;
  confirm: ConfirmOutgoingDeliveryFn;
  save: (decision: StuckWhatsAppReplyDecision) => Promise<void>;
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
  intervalMs?: number;
  loggerError?: (error: unknown) => void;
};

let activeHandle: WhatsAppReplyRecoveryWorkerHandle | null = null;

export function isWhatsAppReplyRecoveryWorkerEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return ["1", "true", "yes", "on"].includes(
    String(env.WHATSAPP_REPLY_RECOVERY_WORKER_ENABLED ?? "false").trim().toLowerCase(),
  );
}

export function resolveWhatsAppReplyRecoveryIntervalMs(env: NodeJS.ProcessEnv = process.env): number {
  return Math.max(15_000, Number(env.WHATSAPP_REPLY_RECOVERY_WORKER_INTERVAL_MS ?? 60_000) || 60_000);
}

export function __resetWhatsAppReplyRecoveryWorkerForTests(): void {
  activeHandle = null;
}

export async function runWhatsAppReplyRecoveryTick(
  deps: Pick<WhatsAppReplyRecoveryWorkerDeps, "listStuck" | "confirm" | "save">,
): Promise<StuckWhatsAppReplyDecision[]> {
  const candidates = await deps.listStuck();
  const decisions = await planStuckWhatsAppReplyRecovery(candidates, deps.confirm);
  for (const decision of decisions) {
    if (decision.persisted) await deps.save(decision);
  }
  return decisions;
}

export function startWhatsAppReplyRecoveryWorker(
  deps: WhatsAppReplyRecoveryWorkerDeps,
  env: NodeJS.ProcessEnv = process.env,
): WhatsAppReplyRecoveryWorkerHandle | null {
  if (!isWhatsAppReplyRecoveryWorkerEnabled(env)) return null;
  if (activeHandle && !activeHandle.isStopped()) return activeHandle;

  const setIntervalFn = deps.setIntervalFn ?? setInterval;
  const clearIntervalFn = deps.clearIntervalFn ?? clearInterval;
  let running = false;
  let stopped = false;
  const timer = setIntervalFn(() => {
    if (running || stopped) return;
    running = true;
    void runWhatsAppReplyRecoveryTick(deps)
      .catch((error) => {
        deps.loggerError?.(error);
      })
      .finally(() => {
        running = false;
      });
  }, deps.intervalMs ?? resolveWhatsAppReplyRecoveryIntervalMs(env));

  const handle: WhatsAppReplyRecoveryWorkerHandle = {
    isRunning: () => running,
    isStopped: () => stopped,
    stop: () => {
      stopped = true;
      clearIntervalFn(timer);
      if (activeHandle === handle) activeHandle = null;
    },
  };
  activeHandle = handle;
  return handle;
}
