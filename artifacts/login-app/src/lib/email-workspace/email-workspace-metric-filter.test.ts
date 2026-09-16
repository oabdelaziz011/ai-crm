/**
 * Email Workspace metric KPI filter — URL + list membership (not counts).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ConversationRecord } from "@workspace/ai-conversation";
import {
  EMAIL_WORKSPACE_METRIC_FILTERS,
  buildEmailWorkspaceMetricSearch,
  conversationHasEmailAiRouting,
  conversationHasFailedEmailOutbound,
  conversationHasSuccessfulEmailOutbound,
  matchesEmailWorkspaceMetricFilter,
  parseEmailWorkspaceMetricFilter,
  readEmailWorkspaceMetricFromSearch,
  resolveEmailWorkspaceMetricFilter,
} from "./email-workspace-metric-filter.ts";
import { EMAIL_COMPOSER_DRAFT_METADATA_KEY, EMAIL_COMPOSE_DISCARDED_KEY } from "./email-thread-outbound.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

function baseConversation(
  overrides: Partial<ConversationRecord> & { id: string },
): ConversationRecord {
  return {
    id: overrides.id,
    company_id: "co-1",
    channel_type: "email",
    status: "active",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    customer_id: null,
    company_channel_id: null,
    assistant_id: null,
    assigned_user_id: null,
    conversation_number: null,
    external_thread_id: null,
    last_message_at: null,
    last_message_preview: null,
    last_participant_type: null,
    metadata: {},
    ...overrides,
  } as ConversationRecord;
}

describe("email workspace metric filter URL helpers", () => {
  it("parses known metrics and defaults to incoming", () => {
    assert.equal(parseEmailWorkspaceMetricFilter("sent"), "sent");
    assert.equal(parseEmailWorkspaceMetricFilter("nope"), null);
    assert.equal(resolveEmailWorkspaceMetricFilter(null), "incoming");
    assert.equal(readEmailWorkspaceMetricFromSearch("?metric=pending"), "pending");
    assert.equal(readEmailWorkspaceMetricFromSearch(""), "incoming");
  });

  it("builds nest-safe search preserving conversation", () => {
    assert.equal(
      buildEmailWorkspaceMetricSearch({ metric: "failed" }),
      "/?metric=failed",
    );
    assert.equal(
      buildEmailWorkspaceMetricSearch({
        metric: "aiRouted",
        conversationId: "c-1",
      }),
      "/?metric=aiRouted&conversation=c-1",
    );
    assert.equal(buildEmailWorkspaceMetricSearch({ metric: "sent" }), "/sent");
    assert.equal(
      buildEmailWorkspaceMetricSearch({
        metric: "sent",
        conversationId: "c-1",
      }),
      "/sent?conversation=c-1",
    );
  });

  it("exposes all six KPI keys", () => {
    assert.deepEqual([...EMAIL_WORKSPACE_METRIC_FILTERS], [
      "incoming",
      "sent",
      "pending",
      "failed",
      "aiRouted",
      "ticketsCreated",
    ]);
  });
});

describe("email workspace metric filter membership", () => {
  it("maps Incoming to inbox bucket and Pending to pending bucket", () => {
    const inbox = baseConversation({
      id: "inbox-1",
      last_message_at: "2026-01-02T00:00:00.000Z",
      last_message_preview: "Hello",
      last_participant_type: "customer",
    });
    const pending = baseConversation({
      id: "pending-1",
      last_message_at: "2026-01-02T00:00:00.000Z",
      last_message_preview: "Inbound hello",
      last_participant_type: "customer",
      metadata: {
        [EMAIL_COMPOSER_DRAFT_METADATA_KEY]: {
          mode: "reply",
          to: ["a@example.com"],
          cc: [],
          bcc: [],
          subject: "Draft",
          body: "Body",
          bodyHtml: "<p>Body</p>",
          updatedAt: "2026-01-02T00:00:00.000Z",
          attachments: [],
        },
      },
    });

    assert.equal(matchesEmailWorkspaceMetricFilter(inbox, "incoming"), true);
    assert.equal(matchesEmailWorkspaceMetricFilter(pending, "incoming"), false);
    assert.equal(matchesEmailWorkspaceMetricFilter(pending, "pending"), true);
    assert.equal(matchesEmailWorkspaceMetricFilter(inbox, "pending"), false);
  });

  it("keeps Incoming exclusive of Sent (agent-last threads only appear under Sent)", () => {
    const inbound = baseConversation({
      id: "in-1",
      last_message_at: "2026-01-02T00:00:00.000Z",
      last_message_preview: "Need help",
      last_participant_type: "customer",
    });
    const outbound = baseConversation({
      id: "out-1",
      last_message_at: "2026-01-02T00:00:00.000Z",
      last_message_preview: "We replied",
      last_participant_type: "employee",
    });
    assert.equal(matchesEmailWorkspaceMetricFilter(inbound, "incoming"), true);
    assert.equal(matchesEmailWorkspaceMetricFilter(inbound, "sent"), false);
    assert.equal(matchesEmailWorkspaceMetricFilter(outbound, "incoming"), false);
    assert.equal(matchesEmailWorkspaceMetricFilter(outbound, "sent"), true);
  });

  it("maps Sent / Failed using existing outbound conversation signals", () => {
    const sent = baseConversation({
      id: "sent-1",
      last_message_at: "2026-01-02T00:00:00.000Z",
      last_message_preview: "Sent body",
      last_participant_type: "employee",
    });
    const failed = baseConversation({
      id: "failed-1",
      metadata: { emailLastOutboundStatus: "failed" },
    });

    assert.equal(conversationHasSuccessfulEmailOutbound(sent), true);
    assert.equal(matchesEmailWorkspaceMetricFilter(sent, "sent"), true);
    assert.equal(conversationHasFailedEmailOutbound(failed), true);
    assert.equal(matchesEmailWorkspaceMetricFilter(failed, "failed"), true);
    assert.equal(matchesEmailWorkspaceMetricFilter(sent, "failed"), false);
  });

  it("maps AI Routed via emailRoutingClassification metadata", () => {
    const routed = baseConversation({
      id: "ai-1",
      metadata: { emailRoutingClassification: { category: "billing" } },
    });
    assert.equal(conversationHasEmailAiRouting(routed), true);
    assert.equal(matchesEmailWorkspaceMetricFilter(routed, "aiRouted"), true);
    assert.equal(
      matchesEmailWorkspaceMetricFilter(baseConversation({ id: "plain" }), "aiRouted"),
      false,
    );
  });

  it("maps Tickets Created via ticket conversation id set (same source as metric)", () => {
    const withTicket = baseConversation({ id: "tkt-conv" });
    const without = baseConversation({ id: "other" });
    const ids = new Set(["tkt-conv"]);
    assert.equal(
      matchesEmailWorkspaceMetricFilter(withTicket, "ticketsCreated", {
        ticketConversationIds: ids,
      }),
      true,
    );
    assert.equal(
      matchesEmailWorkspaceMetricFilter(without, "ticketsCreated", {
        ticketConversationIds: ids,
      }),
      false,
    );
  });

  it("never surfaces discarded compose shells under any metric", () => {
    const discarded = baseConversation({
      id: "discarded",
      metadata: { [EMAIL_COMPOSE_DISCARDED_KEY]: true },
    });
    for (const metric of EMAIL_WORKSPACE_METRIC_FILTERS) {
      assert.equal(
        matchesEmailWorkspaceMetricFilter(discarded, metric, {
          ticketConversationIds: new Set(["discarded"]),
        }),
        false,
        metric,
      );
    }
  });
});

describe("email metric cards interaction contract", () => {
  it("EmailInboxMetrics renders six clickable KPI tabs wired to metric query", () => {
    const src = readFileSync(
      join(__dirname, "../../components/email/email-inbox-metrics.tsx"),
      "utf8",
    );
    assert.match(src, /role=\"tablist\"/);
    assert.match(src, /data-testid=\"email-inbox-metrics\"/);
    for (const key of EMAIL_WORKSPACE_METRIC_FILTERS) {
      assert.match(src, new RegExp(`email-metric-\\$\\{key\\}|email-metric-${key}`));
    }
    assert.match(src, /EMAIL_WORKSPACE_METRIC_FILTERS\.map/);
    assert.match(src, /buildEmailWorkspaceMetricSearch/);
    assert.match(src, /aria-selected=\{active\}/);
    assert.match(src, /cursor-pointer/);
    assert.match(src, /focus-visible:ring-2/);
    assert.doesNotMatch(src, /useEmailWorkspaceMetrics[\s\S]*countEmailWorkspaceOutboundMetrics/);
  });

  it("EmailWorkspacePanel applies metric filter to the conversation list", () => {
    const src = readFileSync(
      join(__dirname, "../../components/email/email-workspace-panel.tsx"),
      "utf8",
    );
    assert.match(src, /matchesEmailWorkspaceMetricFilter/);
    assert.match(src, /readEmailWorkspaceMetricFromSearch/);
    assert.match(src, /data-testid=\"email-workspace-conversation-list\"/);
    assert.match(src, /data-metric-filter=\{metricFilter\}/);
    assert.match(src, /forcedMetric/);
    assert.match(src, /metadata->>source\",\s*\"eq\",\s*\"email\"/);
  });

  it("EN/AR metric filter aria strings are present and human", () => {
    const localesRoot = join(__dirname, "../../locales");
    const en = JSON.parse(readFileSync(join(localesRoot, "en/common.json"), "utf8"));
    const ar = JSON.parse(readFileSync(join(localesRoot, "ar/common.json"), "utf8"));
    for (const key of EMAIL_WORKSPACE_METRIC_FILTERS) {
      assert.ok(en.emailModule.metrics[key], `en missing ${key}`);
      assert.ok(ar.emailModule.metrics[key], `ar missing ${key}`);
    }
    assert.match(en.emailModule.metrics.filterAria, /\{\{label\}\}/);
    assert.match(ar.emailModule.metrics.filterAria, /\{\{label\}\}/);
    assert.ok(en.emailModule.metrics.tablistAria);
    assert.ok(ar.emailModule.metrics.tablistAria);
    assert.doesNotMatch(en.emailModule.metrics.filterAria, /emailModule\./);
    assert.doesNotMatch(ar.emailModule.metrics.filterAria, /emailModule\./);
  });
});
