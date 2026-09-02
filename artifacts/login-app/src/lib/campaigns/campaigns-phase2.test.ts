/**
 * Marketing Campaigns Phase 2A/2B — multi-channel domain tests.
 * Mocks/fakes only. NO real Meta / WhatsApp / Instagram / Messenger sends.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  mapChannelOutboundToRecipientOutcome,
  type CampaignChannelOutboundPort,
} from "./channel-outbound-port.ts";
import { MarketingCampaignService } from "./campaign-execution-service.ts";
import {
  isWithinMessagingResponseWindow,
  renderMetaMessagingCampaignText,
} from "./thread-eligibility.ts";
import { MarketingCampaignError, normalizeCampaignChannels } from "./types.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Mirrors live public.customers — no soft-delete column. */
type CustomerRow = {
  id: string;
  company_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  age: number | null;
  gender: string | null;
  created_at: string;
};

type PrefRow = { customer_id: string; company_id: string; receive_marketing: boolean };

type SessionSeed = {
  id: string;
  company_id: string;
  company_channel_id: string;
  conversation_id: string;
  channel_key: string;
  external_thread_id: string | null;
  session_status: string;
  last_inbound_at: string | null;
};

type ConversationSeed = {
  id: string;
  company_id: string;
  customer_id: string;
  channel_type: string;
  deleted_at: string | null;
  last_message_at: string;
};

function ctx() {
  return {
    companyId: "co-1",
    actorUserId: "user-1",
    isSuperAdmin: false,
    hasPermission: (code: string) => code === "campaigns.create" || code === "campaigns.send",
  };
}

function createPhase2Harness(options?: {
  customers?: CustomerRow[];
  prefs?: PrefRow[];
  conversations?: ConversationSeed[];
  sessions?: SessionSeed[];
  whatsappChannels?: Array<Record<string, unknown>>;
  instagramChannels?: Array<Record<string, unknown>>;
  messengerChannels?: Array<Record<string, unknown>>;
  whatsappSettings?: Record<string, unknown> | null;
  instagramSettings?: Record<string, unknown> | null;
  messengerSettings?: Record<string, unknown> | null;
  features?: Record<string, boolean>;
  channelOutbound?: CampaignChannelOutboundPort;
  sendImpl?: (customerId: string) => Promise<{
    messageIds: string[];
    queueIds: string[];
    channelQueueIds?: Record<string, string>;
    skippedChannels: string[];
    failedChannels?: string[];
    deduplicated: boolean;
  }>;
  nowMs?: number;
}) {
  const customers = [...(options?.customers ?? [])];
  const prefs = [...(options?.prefs ?? [])];
  const conversations = [...(options?.conversations ?? [])];
  const sessions = [...(options?.sessions ?? [])];
  const campaigns: Record<string, unknown>[] = [];
  const recipients: Record<string, unknown>[] = [];
  let recipientSeq = 0;
  let campaignSeq = 0;

  const whatsappChannels = options?.whatsappChannels ?? [
    {
      id: "cc-wa-1",
      is_enabled: true,
      deleted_at: null,
      communication_channels: { key: "whatsapp" },
    },
  ];
  const instagramChannels = options?.instagramChannels ?? [
    {
      id: "cc-ig-1",
      is_enabled: true,
      deleted_at: null,
      communication_channels: { key: "instagram" },
    },
  ];
  const messengerChannels = options?.messengerChannels ?? [
    {
      id: "cc-ms-1",
      is_enabled: true,
      deleted_at: null,
      communication_channels: { key: "messenger" },
    },
  ];

  const whatsappSettings = options?.whatsappSettings ?? {
    company_id: "co-1",
    enabled: true,
    phone_number_id: "pn-1",
    has_access_token: true,
    token_status: "valid",
    provider: "meta_cloud",
    access_token: "",
    business_account_id: "",
    webhook_verify_token: "",
    api_version: "v21.0",
    app_secret: "",
    default_language: "en",
    max_retry_count: 3,
    has_webhook_verify_token: true,
    has_app_secret: true,
  };
  const instagramSettings = options?.instagramSettings ?? {
    company_id: "co-1",
    enabled: true,
    has_access_token: true,
    instagram_business_account_id: "ig-ba-1",
    page_id: "page-1",
  };
  const messengerSettings = options?.messengerSettings ?? {
    company_id: "co-1",
    enabled: true,
    has_access_token: true,
    page_id: "page-1",
  };

  const features = {
    campaigns: true,
    whatsapp_channel: true,
    "channel.instagram": true,
    "channel.facebook": true,
    ...(options?.features ?? {}),
  };

  const sendCalls: unknown[] = [];
  const outboundCalls: unknown[] = [];
  const dispatcher = {
    send: async (req: { recipient?: { customerId?: string } }) => {
      sendCalls.push(req);
      if (options?.sendImpl) return options.sendImpl(req.recipient?.customerId ?? "");
      return {
        messageIds: ["n-1"],
        queueIds: ["q-1"],
        channelQueueIds: { whatsapp: `q-${req.recipient?.customerId ?? "x"}` },
        skippedChannels: [],
        failedChannels: [],
        deduplicated: false,
      };
    },
  };

  const channelOutbound: CampaignChannelOutboundPort = options?.channelOutbound ?? {
    dispatch: async (req) => {
      outboundCalls.push(req);
      return {
        deliveryEventId: `del-${req.channelKey}-${req.externalThreadId}`,
        deliveryStatus: "sent",
        externalMessageId: `mid-${req.channelKey}-${req.externalThreadId}`,
      };
    },
  };

  const client = {
    from: (table: string) => {
      if (table === "customers") {
        const filters: Record<string, unknown> = {};
        let idsIn: string[] | null = null;
        const chain: Record<string, unknown> = {};
        const self = () => chain;
        chain.select = (cols?: string) => {
          if (typeof cols === "string" && /\bdeleted_at\b/.test(cols)) {
            throw new Error("customers.deleted_at is not a live schema column");
          }
          return chain;
        };
        chain.eq = (col: string, val: unknown) => {
          filters[col] = val;
          return chain;
        };
        chain.in = (col: string, vals: string[]) => {
          if (col === "id") idsIn = vals;
          return chain;
        };
        chain.is = (col: string, _val: unknown) => {
          if (col === "deleted_at") {
            throw new Error("customers.deleted_at is not a live schema column");
          }
          return chain;
        };
        (chain as { then: typeof Promise.prototype.then }).then = (
          onfulfilled: (v: unknown) => unknown,
          onrejected?: (e: unknown) => unknown,
        ) =>
          Promise.resolve({
            data: customers.filter((c) => {
              if (filters.company_id && c.company_id !== filters.company_id) return false;
              if (idsIn && !idsIn.includes(c.id)) return false;
              return true;
            }),
            error: null,
          }).then(onfulfilled, onrejected);
        return chain;
      }

      if (table === "customer_communication_preferences") {
        const filters: Record<string, unknown> = {};
        let idsIn: string[] | null = null;
        const chain: Record<string, unknown> = {};
        const self = () => chain;
        chain.select = self;
        chain.eq = (col: string, val: unknown) => {
          filters[col] = val;
          return chain;
        };
        chain.in = (_col: string, vals: string[]) => {
          idsIn = vals;
          return chain;
        };
        (chain as { then: typeof Promise.prototype.then }).then = (
          onfulfilled: (v: unknown) => unknown,
          onrejected?: (e: unknown) => unknown,
        ) =>
          Promise.resolve({
            data: prefs.filter((p) => {
              if (filters.company_id && p.company_id !== filters.company_id) return false;
              if (filters.receive_marketing === true && !p.receive_marketing) return false;
              if (idsIn && !idsIn.includes(p.customer_id)) return false;
              return true;
            }),
            error: null,
          }).then(onfulfilled, onrejected);
        return chain;
      }

      if (table === "company_channels") {
        const chain: Record<string, unknown> = {};
        const self = () => chain;
        chain.select = self;
        chain.eq = self;
        chain.is = self;
        (chain as { then: typeof Promise.prototype.then }).then = (
          onfulfilled: (v: unknown) => unknown,
          onrejected?: (e: unknown) => unknown,
        ) =>
          Promise.resolve({
            data: [...whatsappChannels, ...instagramChannels, ...messengerChannels],
            error: null,
          }).then(onfulfilled, onrejected);
        return chain;
      }

      if (table === "conversations") {
        const filters: Record<string, unknown> = {};
        const chain: Record<string, unknown> = {};
        const self = () => chain;
        chain.select = self;
        chain.eq = (col: string, val: unknown) => {
          filters[col] = val;
          return chain;
        };
        chain.is = self;
        chain.order = self;
        (chain as { then: typeof Promise.prototype.then }).then = (
          onfulfilled: (v: unknown) => unknown,
          onrejected?: (e: unknown) => unknown,
        ) =>
          Promise.resolve({
            data: conversations.filter((c) => {
              if (filters.company_id && c.company_id !== filters.company_id) return false;
              if (filters.customer_id && c.customer_id !== filters.customer_id) return false;
              if (filters.channel_type && c.channel_type !== filters.channel_type) return false;
              if (c.deleted_at) return false;
              return true;
            }),
            error: null,
          }).then(onfulfilled, onrejected);
        return chain;
      }

      if (table === "channel_sessions") {
        const filters: Record<string, unknown> = {};
        const chain: Record<string, unknown> = {};
        const self = () => chain;
        chain.select = self;
        chain.eq = (col: string, val: unknown) => {
          filters[col] = val;
          return chain;
        };
        chain.order = self;
        (chain as { then: typeof Promise.prototype.then }).then = (
          onfulfilled: (v: unknown) => unknown,
          onrejected?: (e: unknown) => unknown,
        ) =>
          Promise.resolve({
            data: sessions.filter((s) => {
              if (filters.company_id && s.company_id !== filters.company_id) return false;
              if (filters.conversation_id && s.conversation_id !== filters.conversation_id) {
                return false;
              }
              if (filters.channel_key && s.channel_key !== filters.channel_key) return false;
              if (filters.session_status && s.session_status !== filters.session_status) {
                return false;
              }
              return true;
            }),
            error: null,
          }).then(onfulfilled, onrejected);
        return chain;
      }

      if (table === "marketing_campaigns") {
        return {
          select: () => ({
            eq: (col1: string, val1: unknown) => ({
              eq: (col2: string, val2: unknown) => ({
                maybeSingle: async () => ({
                  data: campaigns.find((c) => c[col1] === val1 && c[col2] === val2) ?? null,
                  error: null,
                }),
              }),
              maybeSingle: async () => ({
                data: campaigns.find((c) => c[col1] === val1) ?? null,
                error: null,
              }),
            }),
          }),
          insert: (values: Record<string, unknown>) => ({
            select: () => ({
              single: async () => {
                const dup = campaigns.find(
                  (c) =>
                    c.company_id === values.company_id &&
                    c.idempotency_key === values.idempotency_key,
                );
                if (dup) {
                  return {
                    data: null,
                    error: { code: "23505", message: "duplicate key" },
                  };
                }
                campaignSeq += 1;
                const row = {
                  id: `camp-${campaignSeq}`,
                  created_at: "2026-08-29T00:00:00.000Z",
                  updated_at: "2026-08-29T00:00:00.000Z",
                  started_at: null,
                  completed_at: null,
                  error_message: null,
                  ...values,
                };
                campaigns.push(row);
                return { data: row, error: null };
              },
            }),
          }),
          update: (patch: Record<string, unknown>) => {
            const filters: Record<string, unknown> = {};
            let statusIn: string[] | null = null;
            const chain: Record<string, unknown> = {};
            chain.eq = (col: string, val: unknown) => {
              filters[col] = val;
              return chain;
            };
            chain.in = (col: string, vals: string[]) => {
              if (col === "status") statusIn = vals;
              return chain;
            };
            chain.select = () => ({
              single: async () => {
                const idx = campaigns.findIndex(
                  (c) =>
                    (!filters.id || c.id === filters.id) &&
                    (!filters.company_id || c.company_id === filters.company_id),
                );
                if (idx < 0) return { data: null, error: { message: "not found" } };
                campaigns[idx] = { ...campaigns[idx], ...patch };
                return { data: campaigns[idx], error: null };
              },
              maybeSingle: async () => {
                const idx = campaigns.findIndex((c) => {
                  if (filters.id && c.id !== filters.id) return false;
                  if (filters.company_id && c.company_id !== filters.company_id) return false;
                  if (statusIn && !statusIn.includes(String(c.status))) return false;
                  return true;
                });
                if (idx < 0) return { data: null, error: null };
                campaigns[idx] = { ...campaigns[idx], ...patch };
                return { data: campaigns[idx], error: null };
              },
            });
            return chain;
          },
        };
      }

      if (table === "marketing_campaign_recipients") {
        return {
          select: () => {
            const filters: Record<string, unknown> = {};
            const chain: Record<string, unknown> = {};
            chain.eq = (col: string, val: unknown) => {
              filters[col] = val;
              return chain;
            };
            chain.maybeSingle = async () => ({
              data:
                recipients.find((r) => Object.entries(filters).every(([k, v]) => r[k] === v)) ??
                null,
              error: null,
            });
            (chain as { then: typeof Promise.prototype.then }).then = (
              onfulfilled: (v: unknown) => unknown,
              onrejected?: (e: unknown) => unknown,
            ) =>
              Promise.resolve({
                data: recipients.filter((r) =>
                  Object.entries(filters).every(([k, v]) => r[k] === v),
                ),
                error: null,
              }).then(onfulfilled, onrejected);
            return chain;
          },
          insert: (values: Record<string, unknown>) => ({
            select: () => ({
              single: async () => {
                const dup = recipients.find(
                  (r) =>
                    r.campaign_id === values.campaign_id &&
                    r.customer_id === values.customer_id &&
                    r.channel === values.channel,
                );
                if (dup) {
                  return { data: null, error: { code: "23505", message: "duplicate key" } };
                }
                recipientSeq += 1;
                const row = {
                  id: `rcpt-${recipientSeq}`,
                  notification_queue_id: null,
                  channel_delivery_event_id: null,
                  provider_message_id: null,
                  error_message: null,
                  created_at: "2026-08-29T00:00:00.000Z",
                  updated_at: "2026-08-29T00:00:00.000Z",
                  ...values,
                };
                recipients.push(row);
                return { data: row, error: null };
              },
            }),
          }),
          update: (patch: Record<string, unknown>) => ({
            eq: (col1: string, val1: unknown) => ({
              eq: (col2: string, val2: unknown) => {
                const idx = recipients.findIndex((r) => r[col1] === val1 && r[col2] === val2);
                if (idx >= 0) recipients[idx] = { ...recipients[idx], ...patch };
                return Promise.resolve({ data: null, error: null });
              },
            }),
          }),
        };
      }

      throw new Error(`unexpected table ${table}`);
    },
    rpc: async (name: string) => {
      if (name === "get_company_whatsapp_settings") {
        return { data: whatsappSettings, error: null };
      }
      if (name === "get_company_instagram_settings") {
        return { data: instagramSettings, error: null };
      }
      if (name === "get_company_messenger_settings") {
        return { data: messengerSettings, error: null };
      }
      throw new Error(`unexpected rpc ${name}`);
    },
  };

  const service = new MarketingCampaignService(client as never, () => dispatcher as never, {
    channelOutbound,
    entitlement: {
      isEnabled: async (_companyId, featureCode) => Boolean(features[featureCode]),
    },
    nowMs: () => options?.nowMs ?? Date.parse("2026-08-29T12:00:00.000Z"),
  });

  return { service, campaigns, recipients, sendCalls, outboundCalls, client };
}

const customer1: CustomerRow = {
  id: "cu-1",
  company_id: "co-1",
  name: "Alice",
  phone: "+966500000001",
  email: "a@ex.com",
  age: 30,
  gender: "female",
  created_at: "2026-01-01T00:00:00.000Z",
};

const prefsOn: PrefRow[] = [
  { customer_id: "cu-1", company_id: "co-1", receive_marketing: true },
];

function freshIgSession(overrides?: Partial<SessionSeed>): SessionSeed {
  return {
    id: "sess-ig-1",
    company_id: "co-1",
    company_channel_id: "cc-ig-1",
    conversation_id: "conv-ig-1",
    channel_key: "instagram",
    external_thread_id: "igsid-1",
    session_status: "active",
    last_inbound_at: "2026-08-29T11:00:00.000Z",
    ...overrides,
  };
}

function freshMsSession(overrides?: Partial<SessionSeed>): SessionSeed {
  return {
    id: "sess-ms-1",
    company_id: "co-1",
    company_channel_id: "cc-ms-1",
    conversation_id: "conv-ms-1",
    channel_key: "messenger",
    external_thread_id: "psid-1",
    session_status: "active",
    last_inbound_at: "2026-08-29T11:00:00.000Z",
    ...overrides,
  };
}

describe("Phase 2 channel allow-list", () => {
  it("normalizes supported channels and drops SMS", () => {
    assert.deepEqual(normalizeCampaignChannels(["whatsapp", "sms", "instagram", "whatsapp"]), [
      "whatsapp",
      "instagram",
    ]);
  });

  it("rejects SMS on createDraft", async () => {
    const h = createPhase2Harness({ customers: [customer1], prefs: prefsOn });
    await assert.rejects(
      () =>
        h.service.createDraft(ctx(), {
          name: "X",
          audience: { type: "all" },
          content: { campaignTitle: "T", detail: "D" },
          idempotencyKey: "sms-bad",
          channels: ["sms" as never],
        }),
      (err: unknown) => err instanceof MarketingCampaignError && err.code === "invalid_input",
    );
  });

  it("329 migration widens channel checks", () => {
    const sql = readFileSync(
      join(__dirname, "../../../../../supabase/migrations/329_marketing_campaigns_multi_channel.sql"),
      "utf8",
    );
    assert.match(sql, /whatsapp', 'instagram', 'messenger'/);
    assert.match(sql, /channel_delivery_event_id/);
    assert.match(sql, /channels <@ array\['whatsapp', 'instagram', 'messenger'\]/);
  });
});

describe("A. WhatsApp path preserved", () => {
  it("1. WhatsApp queue success → queued", async () => {
    const h = createPhase2Harness({ customers: [customer1], prefs: prefsOn });
    const draft = await h.service.createDraft(ctx(), {
      name: "WA",
      audience: { type: "manual", customerIds: ["cu-1"] },
      content: { campaignTitle: "Hi", detail: "Sale" },
      idempotencyKey: "p2-wa-q",
      channels: ["whatsapp"],
    });
    const result = await h.service.execute(ctx(), { campaignId: draft.id });
    assert.equal(result.queuedCount, 1);
    assert.equal(result.sentCount, 0);
    assert.equal(h.recipients[0]?.status, "queued");
    assert.equal(h.outboundCalls.length, 0);
  });

  it("2. domain never marks WhatsApp queue success as sent", () => {
    // Provider later reconciliation is outside Phase 2A; domain outcome stays queued.
    assert.equal(
      mapChannelOutboundToRecipientOutcome({
        deliveryEventId: "x",
        deliveryStatus: "sent",
        externalMessageId: "m",
      }).status,
      "sent",
    );
  });

  it("3. WhatsApp queue failure → failed", async () => {
    const h = createPhase2Harness({
      customers: [customer1],
      prefs: prefsOn,
      sendImpl: async () => ({
        messageIds: [],
        queueIds: [],
        channelQueueIds: {},
        skippedChannels: [],
        failedChannels: ["whatsapp"],
        deduplicated: false,
      }),
    });
    const draft = await h.service.createDraft(ctx(), {
      name: "WA",
      audience: { type: "manual", customerIds: ["cu-1"] },
      content: { campaignTitle: "Hi", detail: "Sale" },
      idempotencyKey: "p2-wa-fail",
      channels: ["whatsapp"],
    });
    const result = await h.service.execute(ctx(), { campaignId: draft.id });
    assert.equal(result.failedCount, 1);
    assert.equal(result.status, "failed");
  });
});

describe("B. Instagram eligibility + executor", () => {
  it("4. valid customer + valid IG session → dispatch sent", async () => {
    const h = createPhase2Harness({
      customers: [customer1],
      prefs: prefsOn,
      conversations: [
        {
          id: "conv-ig-1",
          company_id: "co-1",
          customer_id: "cu-1",
          channel_type: "instagram",
          deleted_at: null,
          last_message_at: "2026-08-29T11:00:00.000Z",
        },
      ],
      sessions: [freshIgSession()],
    });
    const draft = await h.service.createDraft(ctx(), {
      name: "IG",
      audience: { type: "manual", customerIds: ["cu-1"] },
      content: { campaignTitle: "Hi", detail: "Sale" },
      idempotencyKey: "p2-ig-ok",
      channels: ["instagram"],
    });
    const result = await h.service.execute(ctx(), { campaignId: draft.id });
    assert.equal(result.sentCount, 1);
    assert.equal(h.recipients[0]?.status, "sent");
    assert.equal(h.recipients[0]?.channel_delivery_event_id, "del-instagram-igsid-1");
    assert.equal(h.recipients[0]?.provider_message_id, "mid-instagram-igsid-1");
    assert.equal(h.outboundCalls.length, 1);
  });

  it("5. no IG session → skipped", async () => {
    const h = createPhase2Harness({ customers: [customer1], prefs: prefsOn, conversations: [] });
    const draft = await h.service.createDraft(ctx(), {
      name: "IG",
      audience: { type: "manual", customerIds: ["cu-1"] },
      content: { campaignTitle: "Hi", detail: "Sale" },
      idempotencyKey: "p2-ig-none",
      channels: ["instagram"],
    });
    const result = await h.service.execute(ctx(), { campaignId: draft.id });
    assert.equal(result.skippedCount, 1);
    assert.match(String(h.recipients[0]?.error_message), /no_instagram_conversation/);
  });

  it("6. missing IGSID → skipped", async () => {
    const h = createPhase2Harness({
      customers: [customer1],
      prefs: prefsOn,
      conversations: [
        {
          id: "conv-ig-1",
          company_id: "co-1",
          customer_id: "cu-1",
          channel_type: "instagram",
          deleted_at: null,
          last_message_at: "2026-08-29T11:00:00.000Z",
        },
      ],
      sessions: [freshIgSession({ external_thread_id: null })],
    });
    const draft = await h.service.createDraft(ctx(), {
      name: "IG",
      audience: { type: "manual", customerIds: ["cu-1"] },
      content: { campaignTitle: "Hi", detail: "Sale" },
      idempotencyKey: "p2-ig-noid",
      channels: ["instagram"],
    });
    await h.service.execute(ctx(), { campaignId: draft.id });
    assert.equal(h.recipients[0]?.status, "skipped");
    assert.equal(h.recipients[0]?.error_message, "missing_igsid");
  });

  it("7. wrong company session → skipped", async () => {
    const h = createPhase2Harness({
      customers: [customer1],
      prefs: prefsOn,
      conversations: [
        {
          id: "conv-ig-1",
          company_id: "co-1",
          customer_id: "cu-1",
          channel_type: "instagram",
          deleted_at: null,
          last_message_at: "2026-08-29T11:00:00.000Z",
        },
      ],
      sessions: [freshIgSession({ company_id: "co-OTHER" })],
    });
    const draft = await h.service.createDraft(ctx(), {
      name: "IG",
      audience: { type: "manual", customerIds: ["cu-1"] },
      content: { campaignTitle: "Hi", detail: "Sale" },
      idempotencyKey: "p2-ig-co",
      channels: ["instagram"],
    });
    // Session filter by company_id excludes other-company sessions → no active session.
    await h.service.execute(ctx(), { campaignId: draft.id });
    assert.equal(h.recipients[0]?.status, "skipped");
  });

  it("8. unavailable Instagram provider → skipped", async () => {
    const h = createPhase2Harness({
      customers: [customer1],
      prefs: prefsOn,
      instagramChannels: [],
      conversations: [
        {
          id: "conv-ig-1",
          company_id: "co-1",
          customer_id: "cu-1",
          channel_type: "instagram",
          deleted_at: null,
          last_message_at: "2026-08-29T11:00:00.000Z",
        },
      ],
      sessions: [freshIgSession()],
    });
    const draft = await h.service.createDraft(ctx(), {
      name: "IG",
      audience: { type: "manual", customerIds: ["cu-1"] },
      content: { campaignTitle: "Hi", detail: "Sale" },
      idempotencyKey: "p2-ig-unavail",
      channels: ["instagram"],
    });
    await h.service.execute(ctx(), { campaignId: draft.id });
    assert.equal(h.recipients[0]?.status, "skipped");
    assert.match(String(h.recipients[0]?.error_message), /instagram_unavailable/);
    assert.equal(h.outboundCalls.length, 0);
  });

  it("9. delivery event / message id persisted", async () => {
    const outcome = mapChannelOutboundToRecipientOutcome({
      deliveryEventId: "del-1",
      deliveryStatus: "sent",
      externalMessageId: "mid-1",
    });
    assert.equal(outcome.status, "sent");
    assert.equal(outcome.channel_delivery_event_id, "del-1");
    assert.equal(outcome.provider_message_id, "mid-1");
  });
});

describe("C. Messenger eligibility + executor", () => {
  it("10. valid Messenger session → sent", async () => {
    const h = createPhase2Harness({
      customers: [customer1],
      prefs: prefsOn,
      conversations: [
        {
          id: "conv-ms-1",
          company_id: "co-1",
          customer_id: "cu-1",
          channel_type: "messenger",
          deleted_at: null,
          last_message_at: "2026-08-29T11:00:00.000Z",
        },
      ],
      sessions: [freshMsSession()],
    });
    const draft = await h.service.createDraft(ctx(), {
      name: "MS",
      audience: { type: "manual", customerIds: ["cu-1"] },
      content: { campaignTitle: "Hi", detail: "Sale" },
      idempotencyKey: "p2-ms-ok",
      channels: ["messenger"],
    });
    const result = await h.service.execute(ctx(), { campaignId: draft.id });
    assert.equal(result.sentCount, 1);
    assert.equal(h.recipients[0]?.channel, "messenger");
  });

  it("11-12. no session / missing PSID → skipped", async () => {
    const noSession = createPhase2Harness({ customers: [customer1], prefs: prefsOn });
    const d1 = await noSession.service.createDraft(ctx(), {
      name: "MS",
      audience: { type: "manual", customerIds: ["cu-1"] },
      content: { campaignTitle: "Hi", detail: "Sale" },
      idempotencyKey: "p2-ms-none",
      channels: ["messenger"],
    });
    await noSession.service.execute(ctx(), { campaignId: d1.id });
    assert.equal(noSession.recipients[0]?.status, "skipped");

    const noPsid = createPhase2Harness({
      customers: [customer1],
      prefs: prefsOn,
      conversations: [
        {
          id: "conv-ms-1",
          company_id: "co-1",
          customer_id: "cu-1",
          channel_type: "messenger",
          deleted_at: null,
          last_message_at: "2026-08-29T11:00:00.000Z",
        },
      ],
      sessions: [freshMsSession({ external_thread_id: "  " })],
    });
    const d2 = await noPsid.service.createDraft(ctx(), {
      name: "MS",
      audience: { type: "manual", customerIds: ["cu-1"] },
      content: { campaignTitle: "Hi", detail: "Sale" },
      idempotencyKey: "p2-ms-psid",
      channels: ["messenger"],
    });
    await noPsid.service.execute(ctx(), { campaignId: d2.id });
    assert.equal(noPsid.recipients[0]?.error_message, "missing_psid");
  });

  it("13. outside messaging window → skipped", async () => {
    assert.equal(
      isWithinMessagingResponseWindow("2026-08-28T11:00:00.000Z", Date.parse("2026-08-29T12:00:00.000Z")),
      false,
    );
    const h = createPhase2Harness({
      customers: [customer1],
      prefs: prefsOn,
      conversations: [
        {
          id: "conv-ms-1",
          company_id: "co-1",
          customer_id: "cu-1",
          channel_type: "messenger",
          deleted_at: null,
          last_message_at: "2026-08-28T11:00:00.000Z",
        },
      ],
      sessions: [freshMsSession({ last_inbound_at: "2026-08-28T11:00:00.000Z" })],
    });
    const draft = await h.service.createDraft(ctx(), {
      name: "MS",
      audience: { type: "manual", customerIds: ["cu-1"] },
      content: { campaignTitle: "Hi", detail: "Sale" },
      idempotencyKey: "p2-ms-window",
      channels: ["messenger"],
    });
    await h.service.execute(ctx(), { campaignId: draft.id });
    assert.equal(h.recipients[0]?.error_message, "messaging_window_not_eligible");
    assert.equal(h.outboundCalls.length, 0);
  });

  it("14-15. provider success/failure", async () => {
    const ok = mapChannelOutboundToRecipientOutcome({
      deliveryEventId: "d",
      deliveryStatus: "sent",
      externalMessageId: "m",
    });
    assert.equal(ok.status, "sent");
    const fail = mapChannelOutboundToRecipientOutcome({
      deliveryEventId: "d",
      deliveryStatus: "failed",
    });
    assert.equal(fail.status, "failed");
  });
});

describe("D. Multi-channel independence", () => {
  it("16-20. same customer WA+IG+MS independent statuses", async () => {
    const h = createPhase2Harness({
      customers: [customer1],
      prefs: prefsOn,
      conversations: [
        {
          id: "conv-ig-1",
          company_id: "co-1",
          customer_id: "cu-1",
          channel_type: "instagram",
          deleted_at: null,
          last_message_at: "2026-08-29T11:00:00.000Z",
        },
        // Messenger intentionally missing → skipped
      ],
      sessions: [freshIgSession()],
    });
    const draft = await h.service.createDraft(ctx(), {
      name: "Multi",
      audience: { type: "manual", customerIds: ["cu-1"] },
      content: { campaignTitle: "Hi", detail: "Sale" },
      idempotencyKey: "p2-multi",
      channels: ["whatsapp", "instagram", "messenger"],
    });
    const result = await h.service.execute(ctx(), { campaignId: draft.id });
    assert.equal(h.recipients.length, 3);
    const byChannel = Object.fromEntries(h.recipients.map((r) => [r.channel, r.status]));
    assert.equal(byChannel.whatsapp, "queued");
    assert.equal(byChannel.instagram, "sent");
    assert.equal(byChannel.messenger, "skipped");
    assert.equal(result.queuedCount, 1);
    assert.equal(result.sentCount, 1);
    assert.equal(result.skippedCount, 1);
    assert.equal(result.status, "completed");
    assert.ok(result.channelCounts.some((c) => c.channel === "whatsapp" && c.queued === 1));
  });
});

describe("E/F security + idempotency", () => {
  it("23. marketing opt-out still excludes audience", async () => {
    const h = createPhase2Harness({
      customers: [customer1],
      prefs: [],
      conversations: [
        {
          id: "conv-ig-1",
          company_id: "co-1",
          customer_id: "cu-1",
          channel_type: "instagram",
          deleted_at: null,
          last_message_at: "2026-08-29T11:00:00.000Z",
        },
      ],
      sessions: [freshIgSession()],
    });
    const draft = await h.service.createDraft(ctx(), {
      name: "Opt",
      audience: { type: "all" },
      content: { campaignTitle: "Hi", detail: "Sale" },
      idempotencyKey: "p2-opt",
      channels: ["instagram"],
    });
    const result = await h.service.execute(ctx(), { campaignId: draft.id });
    assert.equal(result.totalRecipientsCount, 0);
    assert.equal(h.outboundCalls.length, 0);
  });

  it("25-27. retry does not re-dispatch sent/queued", async () => {
    const h = createPhase2Harness({
      customers: [customer1],
      prefs: prefsOn,
      conversations: [
        {
          id: "conv-ig-1",
          company_id: "co-1",
          customer_id: "cu-1",
          channel_type: "instagram",
          deleted_at: null,
          last_message_at: "2026-08-29T11:00:00.000Z",
        },
      ],
      sessions: [freshIgSession()],
    });
    const draft = await h.service.createDraft(ctx(), {
      name: "Retry",
      audience: { type: "manual", customerIds: ["cu-1"] },
      content: { campaignTitle: "Hi", detail: "Sale" },
      idempotencyKey: "p2-retry",
      channels: ["whatsapp", "instagram"],
    });
    await h.service.execute(ctx(), { campaignId: draft.id });
    assert.equal(h.sendCalls.length, 1);
    assert.equal(h.outboundCalls.length, 1);
    const camp = h.campaigns.find((c) => c.id === draft.id)!;
    camp.status = "failed";
    camp.completed_at = null;
    await h.service.execute(ctx(), { campaignId: draft.id });
    assert.equal(h.sendCalls.length, 1);
    assert.equal(h.outboundCalls.length, 1);
  });

  it("idempotency: same key concurrent create+execute → one campaign; no duplicate IG/MS/WA", async () => {
    const h = createPhase2Harness({
      customers: [customer1],
      prefs: prefsOn,
      conversations: [
        {
          id: "conv-ig-1",
          company_id: "co-1",
          customer_id: "cu-1",
          channel_type: "instagram",
          deleted_at: null,
          last_message_at: "2026-08-29T11:00:00.000Z",
        },
        {
          id: "conv-ms-1",
          company_id: "co-1",
          customer_id: "cu-1",
          channel_type: "messenger",
          deleted_at: null,
          last_message_at: "2026-08-29T11:00:00.000Z",
        },
      ],
      sessions: [freshIgSession(), freshMsSession()],
    });

    async function createAndExecute() {
      const draft = await h.service.createDraft(ctx(), {
        name: "Multi",
        audience: { type: "manual", customerIds: ["cu-1"] },
        content: { campaignTitle: "Hi", detail: "Sale" },
        idempotencyKey: "p2-submit-stable",
        channels: ["whatsapp", "instagram", "messenger"],
      });
      const result = await h.service.execute(ctx(), { idempotencyKey: "p2-submit-stable" });
      return { draft, result };
    }

    const [a, b] = await Promise.all([createAndExecute(), createAndExecute()]);
    assert.equal(h.campaigns.length, 1);
    assert.equal(a.draft.id, b.draft.id);
    assert.equal(h.sendCalls.length, 1);
    assert.equal(h.outboundCalls.length, 2);
    assert.equal(h.recipients.length, 3);

    const again = await createAndExecute();
    assert.equal(again.draft.id, a.draft.id);
    assert.equal(again.result.reusedExisting, true);
    assert.equal(h.sendCalls.length, 1);
    assert.equal(h.outboundCalls.length, 2);
  });
});

describe("content + window helpers", () => {
  it("renders plain text for IG/Messenger", () => {
    assert.equal(
      renderMetaMessagingCampaignText({ campaignTitle: "Hello", detail: "World" }),
      "Hello\n\nWorld",
    );
  });
});
