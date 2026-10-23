import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  __resetWhatsAppReplyRecoveryWorkerForTests,
  isWhatsAppReplyRecoveryWorkerEnabled,
  runWhatsAppReplyRecoveryTick,
  startWhatsAppReplyRecoveryWorker,
} from "./whatsapp-reply-recovery-worker.js";
import type { StuckWhatsAppReply } from "../services/reconcile-stuck-whatsapp-replies.js";

describe("whatsapp reply recovery worker", () => {
  it("is off unless the env flag is set", () => {
    assert.equal(isWhatsAppReplyRecoveryWorkerEnabled({}), false);
    assert.equal(isWhatsAppReplyRecoveryWorkerEnabled({ WHATSAPP_REPLY_RECOVERY_WORKER_ENABLED: "true" }), true);
  });

  it("a tick confirms an old accepted row, holds an unknown row, and does not send", async () => {
    let sendCalls = 0;
    const saved: string[] = [];
    const rows: StuckWhatsAppReply[] = [
      {
        messageId: "accepted",
        replyText: "رد محفوظ",
        outboundPhase: "preparing",
        deliveryStatus: "sent",
        hasNewerInbound: false,
        externalMessageId: "wamid.1",
        recoveryAttempts: 0,
        recoveryDisposition: null,
        ageMs: 180_000,
      },
      {
        messageId: "unknown",
        replyText: "رد محفوظ",
        outboundPhase: "preparing",
        deliveryStatus: null,
        hasNewerInbound: false,
        recoveryAttempts: 0,
        recoveryDisposition: null,
        ageMs: 180_000,
      },
    ];
    const decisions = await runWhatsAppReplyRecoveryTick({
      listStuck: async () => rows,
      confirm: async () => undefined,
      save: async (decision) => {
        saved.push(`${decision.messageId}:${decision.disposition}`);
      },
    });
    assert.deepEqual(saved, ["accepted:confirmed", "unknown:needs_review"]);
    assert.equal(decisions.some((decision) => decision.outcome.action === "confirm_only"), true);
    assert.equal(sendCalls, 0);
  });

  it("does not overlap ticks in one process", async () => {
    __resetWhatsAppReplyRecoveryWorkerForTests();
    let active = 0;
    let maxActive = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const timer = { id: 0 as ReturnType<typeof setInterval> | 0 };
    const handle = startWhatsAppReplyRecoveryWorker(
      {
        listStuck: async () => {
          active += 1;
          maxActive = Math.max(maxActive, active);
          await gate;
          active -= 1;
          return [];
        },
        confirm: async () => undefined,
        save: async () => undefined,
        intervalMs: 5,
        setIntervalFn: ((fn: () => void) => {
          timer.id = setInterval(fn, 5);
          fn();
          return timer.id;
        }) as typeof setInterval,
        clearIntervalFn: ((id: ReturnType<typeof setInterval>) => {
          clearInterval(id);
        }) as typeof clearInterval,
      },
      { WHATSAPP_REPLY_RECOVERY_WORKER_ENABLED: "true" },
    );
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(maxActive, 1);
    release();
    handle?.stop();
    __resetWhatsAppReplyRecoveryWorkerForTests();
  });
});
