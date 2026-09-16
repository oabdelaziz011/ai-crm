/**
 * One-time / admin legacy cleanup:
 * Reconcile stuck pending/preparing conversation_messages that are
 * deterministically linked to a FAILED channel_delivery_events row.
 *
 * Usage:
 *   node scripts/reconcile-legacy-failed-outbound-messages.mjs            # dry-run
 *   node scripts/reconcile-legacy-failed-outbound-messages.mjs --apply    # mutate via RPC
 *
 * Does NOT send WhatsApp. Does NOT touch the new outbound lifecycle code.
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateLegacyFailedOutboundReconcile } from "./lib/legacy-failed-outbound-reconcile.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const apply = process.argv.includes("--apply");
const conversationFilter = (() => {
  const idx = process.argv.indexOf("--conversation");
  return idx >= 0 ? process.argv[idx + 1] : null;
})();

const env = {};
for (const p of [
  resolve(projectRoot, "artifacts/login-app/.env.local"),
  resolve(projectRoot, ".env"),
  resolve(projectRoot, "artifacts/api-server/.env"),
]) {
  try {
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* optional */
  }
}

const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error(JSON.stringify({ ok: false, reason: "missing_env" }));
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

function isStuckPreparing(message) {
  const phase = message.metadata?.outboundPhase;
  return (
    message.status === "pending"
    || phase === "preparing"
    || phase === "dispatching"
  );
}

let deliveryQuery = sb
  .from("channel_delivery_events")
  .select(
    "id, company_id, conversation_id, outbound_message_id, delivery_status, failed_at, error_message, external_message_id, created_at",
  )
  .eq("delivery_status", "failed")
  .not("outbound_message_id", "is", null);

if (conversationFilter) {
  deliveryQuery = deliveryQuery.eq("conversation_id", conversationFilter);
}

const { data: failedDeliveries, error: delErr } = await deliveryQuery.limit(5000);
if (delErr) {
  console.error(JSON.stringify({ ok: false, stage: "fetch_deliveries", error: delErr.message }));
  process.exit(1);
}

const messageIds = [...new Set((failedDeliveries ?? []).map((d) => d.outbound_message_id).filter(Boolean))];
const conversationIds = [...new Set((failedDeliveries ?? []).map((d) => d.conversation_id).filter(Boolean))];

const { data: messages, error: msgErr } = messageIds.length
  ? await sb
      .from("conversation_messages")
      .select("id, conversation_id, message_type, status, metadata, external_message_id, created_at")
      .in("id", messageIds)
  : { data: [], error: null };

if (msgErr) {
  console.error(JSON.stringify({ ok: false, stage: "fetch_messages", error: msgErr.message }));
  process.exit(1);
}

const { data: conversations, error: convErr } = conversationIds.length
  ? await sb.from("conversations").select("id, company_id").in("id", conversationIds)
  : { data: [], error: null };

if (convErr) {
  console.error(JSON.stringify({ ok: false, stage: "fetch_conversations", error: convErr.message }));
  process.exit(1);
}

const messageById = new Map((messages ?? []).map((m) => [m.id, m]));
const conversationById = new Map((conversations ?? []).map((c) => [c.id, c]));

const eligible = [];
const skipped = [];

for (const delivery of failedDeliveries ?? []) {
  const message = messageById.get(delivery.outbound_message_id);
  const conversation = conversationById.get(delivery.conversation_id);
  if (!message || !conversation) {
    skipped.push({
      deliveryId: delivery.id,
      messageId: delivery.outbound_message_id,
      reason: !message ? "message_missing" : "conversation_missing",
    });
    continue;
  }

  const decision = evaluateLegacyFailedOutboundReconcile({ message, conversation, delivery });
  if (!decision.eligible) {
    skipped.push({
      deliveryId: delivery.id,
      messageId: message.id,
      companyId: conversation.company_id,
      reason: decision.reason,
      messageStatus: message.status,
      outboundPhase: message.metadata?.outboundPhase ?? null,
    });
    continue;
  }

  eligible.push({
    messageId: message.id,
    deliveryId: delivery.id,
    conversationId: conversation.id,
    companyId: conversation.company_id,
    messageStatusBefore: message.status,
    outboundPhaseBefore: message.metadata?.outboundPhase ?? null,
    deliveryError: delivery.error_message ?? null,
    failedAt: delivery.failed_at,
  });
}

// Deduplicate by message id (multiple failed deliveries → confirm once).
const eligibleByMessage = new Map();
for (const row of eligible) {
  if (!eligibleByMessage.has(row.messageId)) eligibleByMessage.set(row.messageId, row);
}
const uniqueEligible = [...eligibleByMessage.values()];

const beforeStuckPreparingCount = (messages ?? []).filter(isStuckPreparing).length;

const results = {
  mode: apply ? "apply" : "dry-run",
  conversationFilter,
  failedDeliveriesScanned: failedDeliveries?.length ?? 0,
  eligibleDeterministicFailedMessages: uniqueEligible.length,
  skippedAmbiguousOrIneligible: skipped.length,
  eligibleSample: uniqueEligible.slice(0, 20),
  skippedReasonCounts: skipped.reduce((acc, row) => {
    acc[row.reason] = (acc[row.reason] ?? 0) + 1;
    return acc;
  }, {}),
  reconciled: [],
  reconcileErrors: [],
};

if (apply) {
  for (const row of uniqueEligible) {
    const { data, error } = await sb.rpc("confirm_conversation_message_outbound", {
      p_message_id: row.messageId,
      p_status: "failed",
      p_external_message_id: null,
    });
    if (error) {
      results.reconcileErrors.push({ messageId: row.messageId, error: error.message });
      continue;
    }
    results.reconciled.push({
      messageId: row.messageId,
      deliveryId: row.deliveryId,
      companyId: row.companyId,
      statusAfter: data?.status ?? null,
      outboundPhaseAfter: data?.metadata?.outboundPhase ?? null,
      dispatchFailedAfter: data?.metadata?.dispatchFailed ?? null,
    });
  }
}

// Post counts (always re-read eligible message ids + conversation preparing snapshot when filtered).
const postMessageIds = messageIds;
const { data: postMessages } = postMessageIds.length
  ? await sb
      .from("conversation_messages")
      .select("id, status, metadata, message_type")
      .in("id", postMessageIds)
  : { data: [] };

let remainingPreparingInScope = (postMessages ?? []).filter(isStuckPreparing).length;

// Broader remaining preparing for the filtered conversation (if provided).
let remainingPreparingInConversation = null;
let remainingPendingNoDeterministicEvidence = null;
let successfulUnchanged = null;

if (conversationFilter) {
  const { data: allOutgoing } = await sb
    .from("conversation_messages")
    .select("id, status, metadata, message_type, external_message_id")
    .eq("conversation_id", conversationFilter)
    .eq("message_type", "outgoing");

  const reconciledIds = new Set(results.reconciled.map((r) => r.messageId));
  const eligibleIds = new Set(uniqueEligible.map((r) => r.messageId));

  remainingPreparingInConversation = (allOutgoing ?? []).filter(isStuckPreparing).length;
  remainingPendingNoDeterministicEvidence = (allOutgoing ?? []).filter((m) => {
    if (!isStuckPreparing(m)) return false;
    return !eligibleIds.has(m.id) && !reconciledIds.has(m.id);
  }).length;

  successfulUnchanged = (allOutgoing ?? []).filter((m) =>
    ["sent", "delivered", "read"].includes(m.status),
  ).map((m) => ({ id: m.id, status: m.status }));
}

results.after = {
  beforeStuckPreparingAmongLinkedMessages: beforeStuckPreparingCount,
  remainingStuckPreparingAmongLinkedMessages: remainingPreparingInScope,
  remainingPreparingInConversation,
  remainingPendingWithNoDeterministicEvidence: remainingPendingNoDeterministicEvidence,
  reconciledCount: results.reconciled.length,
  reconcileErrorCount: results.reconcileErrors.length,
  successfulMessagesObservedUnchanged: successfulUnchanged,
};

const outPath = resolve(
  projectRoot,
  "artifacts/login-app/.verification-screenshots/_tmp-legacy-failed-outbound-reconcile-report.json",
);
writeFileSync(outPath, JSON.stringify(results, null, 2));
console.log(JSON.stringify({ ok: true, outPath, ...results.after, mode: results.mode, eligible: results.eligibleDeterministicFailedMessages, skipped: results.skippedAmbiguousOrIneligible }, null, 2));
