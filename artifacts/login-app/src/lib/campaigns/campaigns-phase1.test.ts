/**
 * Marketing Campaigns Phase 1 — domain foundation tests.
 * All mocks/fakes. NO real WhatsApp sends.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { CampaignAudienceResolver } from "./audience-resolver.ts";
import {
  mapDispatcherResultToRecipientOutcome,
  MarketingCampaignService,
} from "./campaign-execution-service.ts";
import { MarketingCampaignError } from "./types.ts";
import { WhatsAppCampaignCapabilityChecker } from "./whatsapp-capability.ts";

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

type CampaignRow = Record<string, unknown>;
type RecipientRow = Record<string, unknown>;

function ctx(overrides?: Partial<{ companyId: string; hasPermission: (c: string) => boolean }>) {
  return {
    companyId: overrides?.companyId ?? "co-1",
    actorUserId: "user-1",
    isSuperAdmin: false,
    hasPermission:
      overrides?.hasPermission ??
      ((code: string) => code === "campaigns.create" || code === "campaigns.send"),
  };
}

function createHarness(options?: {
  customers?: CustomerRow[];
  prefs?: PrefRow[];
  whatsappChannels?: Array<Record<string, unknown>>;
  whatsappSettings?: Record<string, unknown> | null;
  dispatcher?: {
    send: (req: unknown) => Promise<{
      messageIds: string[];
      queueIds: string[];
      channelQueueIds?: Record<string, string>;
      skippedChannels: string[];
      failedChannels?: string[];
      deduplicated: boolean;
    }>;
  };
  sendImpl?: (customerId: string) => Promise<{
    messageIds: string[];
    queueIds: string[];
    channelQueueIds?: Record<string, string>;
    skippedChannels: string[];
    failedChannels?: string[];
    deduplicated: boolean;
  }>;
}) {
  const customers = [...(options?.customers ?? [])];
  const prefs = [...(options?.prefs ?? [])];
  const campaigns: CampaignRow[] = [];
  const recipients: RecipientRow[] = [];
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

  const whatsappSettings = options?.whatsappSettings ?? {
    company_id: "co-1",
    enabled: true,
    provider: "meta_cloud",
    access_token: "",
    phone_number_id: "pn-1",
    business_account_id: "ba-1",
    webhook_verify_token: "",
    api_version: "v21.0",
    app_secret: "",
    default_language: "en",
    max_retry_count: 3,
    has_access_token: true,
    has_webhook_verify_token: true,
    has_app_secret: true,
    token_status: "valid",
  };

  const sendCalls: unknown[] = [];
  const dispatcher = options?.dispatcher ?? {
    send: async (req: { recipient?: { customerId?: string } }) => {
      sendCalls.push(req);
      if (options?.sendImpl) {
        return options.sendImpl(req.recipient?.customerId ?? "");
      }
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
        chain.is = (col: string, val: unknown) => {
          if (col === "deleted_at") {
            throw new Error("customers.deleted_at is not a live schema column");
          }
          filters[`${col}_is`] = val;
          return chain;
        };
        chain.then = undefined;
        const run = async () => {
          // Live schema: no soft-delete on customers.
          let rows = [...customers];
          if (filters.company_id) {
            rows = rows.filter((c) => c.company_id === filters.company_id);
          }
          if (idsIn) {
            rows = rows.filter((c) => idsIn!.includes(c.id));
          }
          return { data: rows, error: null };
        };
        // Make awaitable
        (chain as { then: typeof Promise.prototype.then }).then = (
          onfulfilled: (v: unknown) => unknown,
          onrejected?: (e: unknown) => unknown,
        ) => Promise.resolve(run()).then(onfulfilled, onrejected);
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
          Promise.resolve({ data: whatsappChannels, error: null }).then(onfulfilled, onrejected);
        return chain;
      }

      if (table === "marketing_campaigns") {
        return {
          select: () => ({
            eq: (col1: string, val1: unknown) => ({
              eq: (col2: string, val2: unknown) => ({
                maybeSingle: async () => {
                  const found =
                    campaigns.find((c) => c[col1] === val1 && c[col2] === val2) ?? null;
                  return { data: found, error: null };
                },
              }),
              maybeSingle: async () => {
                const found = campaigns.find((c) => c[col1] === val1) ?? null;
                return { data: found, error: null };
              },
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
                const idx = campaigns.findIndex((c) => {
                  if (filters.id && c.id !== filters.id) return false;
                  if (filters.company_id && c.company_id !== filters.company_id) return false;
                  return true;
                });
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
            const self = () => chain;
            chain.eq = (col: string, val: unknown) => {
              filters[col] = val;
              return chain;
            };
            chain.maybeSingle = async () => {
              const found =
                recipients.find((r) =>
                  Object.entries(filters).every(([k, v]) => r[k] === v),
                ) ?? null;
              return { data: found, error: null };
            };
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
                  return {
                    data: null,
                    error: { code: "23505", message: "duplicate key" },
                  };
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
      throw new Error(`unexpected rpc ${name}`);
    },
  };

  const service = new MarketingCampaignService(client as never, () => dispatcher as never, {
    entitlement: {
      isEnabled: async (_companyId, featureCode) =>
        featureCode === "campaigns" || featureCode === "whatsapp_channel",
    },
  });

  return {
    client,
    service,
    campaigns,
    recipients,
    sendCalls,
    audience: new CampaignAudienceResolver(client as never),
    capability: new WhatsAppCampaignCapabilityChecker(client as never, {
      isEnabled: async (_companyId, featureCode) => featureCode === "whatsapp_channel",
    }),
  };
}

const baseCustomers: CustomerRow[] = [
  {
    id: "cu-1",
    company_id: "co-1",
    name: "Alice",
    phone: "+966500000001",
    email: "a@ex.com",
    age: 30,
    gender: "female",
    created_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "cu-2",
    company_id: "co-1",
    name: "Bob",
    phone: "+966500000002",
    email: "b@ex.com",
    age: 40,
    gender: "male",
    created_at: "2026-02-01T00:00:00.000Z",
  },
  {
    id: "cu-3",
    company_id: "co-2",
    name: "OtherCo",
    phone: "+966500000003",
    email: "o@ex.com",
    age: 25,
    gender: "female",
    created_at: "2026-01-15T00:00:00.000Z",
  },
];

const marketingOn: PrefRow[] = [
  { customer_id: "cu-1", company_id: "co-1", receive_marketing: true },
  { customer_id: "cu-2", company_id: "co-1", receive_marketing: true },
];

describe("CampaignAudienceResolver", () => {
  it("1. company tenant isolation — never returns other company customers for all", async () => {
    const { audience } = createHarness({
      customers: baseCustomers,
      prefs: [
        ...marketingOn,
        { customer_id: "cu-3", company_id: "co-2", receive_marketing: true },
      ],
    });
    const result = await audience.resolve("co-1", { type: "all" });
    assert.deepEqual(
      result.customers.map((c) => c.id).sort(),
      ["cu-1", "cu-2"],
    );
    assert.equal(result.recipientCount, 2);
  });

  it("2. all-customer audience", async () => {
    const { audience } = createHarness({ customers: baseCustomers, prefs: marketingOn });
    const result = await audience.resolve("co-1", { type: "all" });
    assert.equal(result.recipientCount, 2);
  });

  it("3. filtered audience (server-safe gender/age)", async () => {
    const { audience } = createHarness({ customers: baseCustomers, prefs: marketingOn });
    const result = await audience.resolve("co-1", {
      type: "filtered",
      filters: { gender: "female", ageMin: 18, ageMax: 35 },
    });
    assert.deepEqual(
      result.customers.map((c) => c.id),
      ["cu-1"],
    );
  });

  it("4. manual audience revalidates IDs", async () => {
    const { audience } = createHarness({ customers: baseCustomers, prefs: marketingOn });
    const result = await audience.resolve("co-1", {
      type: "manual",
      customerIds: ["cu-2", "cu-2", "cu-missing"],
    });
    assert.deepEqual(
      result.customers.map((c) => c.id),
      ["cu-2"],
    );
    assert.equal(result.excludedMissingCount, 1);
  });

  it("5. marketing opt-out (receive_marketing false / missing)", async () => {
    const { audience } = createHarness({
      customers: baseCustomers,
      prefs: [{ customer_id: "cu-1", company_id: "co-1", receive_marketing: true }],
    });
    const result = await audience.resolve("co-1", { type: "all" });
    assert.deepEqual(
      result.customers.map((c) => c.id),
      ["cu-1"],
    );
    assert.equal(result.excludedOptedOutCount, 1);
  });

  it("5b. receive_marketing=false is excluded", async () => {
    const { audience } = createHarness({
      customers: baseCustomers,
      prefs: [
        { customer_id: "cu-1", company_id: "co-1", receive_marketing: true },
        { customer_id: "cu-2", company_id: "co-1", receive_marketing: false },
      ],
    });
    const result = await audience.resolve("co-1", { type: "all" });
    assert.deepEqual(
      result.customers.map((c) => c.id),
      ["cu-1"],
    );
    assert.equal(result.excludedOptedOutCount, 1);
  });

  it("schema regression: customers queries never use deleted_at", async () => {
    const src = readFileSync(join(__dirname, "audience-resolver.ts"), "utf8");
    assert.ok(!/\.is\(\s*["']deleted_at["']/.test(src));
    assert.ok(!/CUSTOMER_SELECT[\s\S]*?deleted_at/.test(src));
    assert.ok(!/\.from\(\s*["']customers["'][\s\S]{0,400}deleted_at/.test(src));

    const { audience, campaigns, recipients, sendCalls } = createHarness({
      customers: baseCustomers,
      prefs: marketingOn,
    });
    await audience.resolve("co-1", { type: "all" });
    await audience.resolve("co-1", {
      type: "filtered",
      filters: { gender: "female" },
    });
    await audience.resolve("co-1", {
      type: "manual",
      customerIds: ["cu-1", "cu-3", "missing"],
    });
    assert.equal(campaigns.length, 0);
    assert.equal(recipients.length, 0);
    assert.equal(sendCalls.length, 0);
  });

  it("6. customer from another company excluded from manual", async () => {
    const { audience } = createHarness({
      customers: baseCustomers,
      prefs: [
        ...marketingOn,
        { customer_id: "cu-3", company_id: "co-2", receive_marketing: true },
      ],
    });
    const result = await audience.resolve("co-1", {
      type: "manual",
      customerIds: ["cu-1", "cu-3"],
    });
    assert.deepEqual(
      result.customers.map((c) => c.id),
      ["cu-1"],
    );
    assert.equal(result.excludedOtherCompanyCount, 1);
  });

  it("7. empty audience", async () => {
    const { audience } = createHarness({ customers: [], prefs: [] });
    const result = await audience.resolve("co-1", { type: "all" });
    assert.equal(result.recipientCount, 0);
  });
});

describe("WhatsAppCampaignCapabilityChecker", () => {
  it("8. WhatsApp unavailable when channel missing", async () => {
    const { capability } = createHarness({ whatsappChannels: [] });
    const result = await capability.check("co-1");
    assert.equal(result.available, false);
    assert.equal(result.reason, "channel_disabled_or_missing");
  });

  it("8b. WhatsApp unavailable when settings disabled", async () => {
    const { capability } = createHarness({
      whatsappSettings: {
        company_id: "co-1",
        enabled: false,
        provider: "meta_cloud",
        phone_number_id: "pn-1",
        has_access_token: true,
        token_status: "valid",
        access_token: "",
        business_account_id: "",
        webhook_verify_token: "",
        api_version: "v21.0",
        app_secret: "",
        default_language: "en",
        max_retry_count: 3,
        has_webhook_verify_token: false,
        has_app_secret: false,
      },
    });
    const result = await capability.check("co-1");
    assert.equal(result.available, false);
    assert.equal(result.reason, "settings_disabled");
  });
});

describe("mapDispatcherResultToRecipientOutcome", () => {
  it("11. queued != sent", () => {
    const outcome = mapDispatcherResultToRecipientOutcome("+9665", {
      messageIds: ["n"],
      queueIds: ["q-99"],
      channelQueueIds: { whatsapp: "q-99" },
      skippedChannels: [],
      failedChannels: [],
      deduplicated: false,
    });
    assert.equal(outcome.status, "queued");
    assert.notEqual(outcome.status, "sent");
    assert.equal(outcome.notification_queue_id, "q-99");
  });

  it("skips when no phone", () => {
    const outcome = mapDispatcherResultToRecipientOutcome(null, {
      messageIds: [],
      queueIds: [],
      skippedChannels: [],
      deduplicated: false,
    });
    assert.equal(outcome.status, "skipped");
  });

  it("10. queue failure", () => {
    const outcome = mapDispatcherResultToRecipientOutcome("+9665", {
      messageIds: [],
      queueIds: [],
      channelQueueIds: {},
      skippedChannels: [],
      failedChannels: ["whatsapp"],
      deduplicated: false,
    });
    assert.equal(outcome.status, "failed");
  });
});

describe("MarketingCampaignService execution", () => {
  it("rejects unauthorized send", async () => {
    const { service } = createHarness({ customers: baseCustomers, prefs: marketingOn });
    await assert.rejects(
      () =>
        service.execute(
          ctx({ hasPermission: () => false }),
          { campaignId: "x" },
        ),
      (err: unknown) => err instanceof MarketingCampaignError && err.code === "unauthorized",
    );
  });

  it("8c. execute throws when WhatsApp unavailable", async () => {
    const { service } = createHarness({
      customers: baseCustomers,
      prefs: marketingOn,
      whatsappChannels: [],
    });
    const draft = await service.createDraft(ctx(), {
      name: "Promo",
      audience: { type: "all" },
      content: { campaignTitle: "Hi", detail: "Sale" },
      idempotencyKey: "idem-wa-off",
    });
    await assert.rejects(
      () => service.execute(ctx(), { campaignId: draft.id }),
      (err: unknown) =>
        err instanceof MarketingCampaignError && err.code === "whatsapp_unavailable",
    );
  });

  it("9. queue success sets queued not sent", async () => {
    const h = createHarness({ customers: baseCustomers, prefs: marketingOn });
    const draft = await h.service.createDraft(ctx(), {
      name: "Promo",
      audience: { type: "manual", customerIds: ["cu-1"] },
      content: { campaignTitle: "Hi", detail: "Sale" },
      idempotencyKey: "idem-q-ok",
    });
    const result = await h.service.execute(ctx(), { campaignId: draft.id });
    assert.equal(result.queuedCount, 1);
    assert.equal(result.sentCount, 0);
    assert.equal(result.status, "completed");
    assert.equal(h.recipients[0]?.status, "queued");
    assert.ok(h.recipients[0]?.notification_queue_id);
    assert.equal(h.sendCalls.length, 1);
  });

  it("10b. queue failure per recipient", async () => {
    const h = createHarness({
      customers: baseCustomers,
      prefs: marketingOn,
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
      name: "Promo",
      audience: { type: "manual", customerIds: ["cu-1"] },
      content: { campaignTitle: "Hi", detail: "Sale" },
      idempotencyKey: "idem-q-fail",
    });
    const result = await h.service.execute(ctx(), { campaignId: draft.id });
    assert.equal(result.failedCount, 1);
    assert.equal(result.queuedCount, 0);
    assert.equal(result.sentCount, 0);
    assert.equal(result.status, "failed");
  });

  it("12. duplicate recipient protection via unique claim", async () => {
    const h = createHarness({ customers: baseCustomers, prefs: marketingOn });
    const draft = await h.service.createDraft(ctx(), {
      name: "Promo",
      audience: { type: "manual", customerIds: ["cu-1"] },
      content: { campaignTitle: "Hi", detail: "Sale" },
      idempotencyKey: "idem-dup",
    });
    // Pre-seed recipient as if concurrent worker claimed it and queued.
    h.recipients.push({
      id: "rcpt-pre",
      campaign_id: draft.id,
      company_id: "co-1",
      customer_id: "cu-1",
      channel: "whatsapp",
      status: "queued",
      notification_queue_id: "q-existing",
      provider_message_id: null,
      error_message: null,
      created_at: "2026-08-29T00:00:00.000Z",
      updated_at: "2026-08-29T00:00:00.000Z",
    });
    const result = await h.service.execute(ctx(), { campaignId: draft.id });
    assert.equal(h.sendCalls.length, 0);
    assert.equal(result.queuedCount, 1);
    assert.equal(h.recipients.filter((r) => r.customer_id === "cu-1").length, 1);
  });

  it("13. retry does not duplicate queue for already queued", async () => {
    const h = createHarness({ customers: baseCustomers, prefs: marketingOn });
    const draft = await h.service.createDraft(ctx(), {
      name: "Promo",
      audience: { type: "manual", customerIds: ["cu-1"] },
      content: { campaignTitle: "Hi", detail: "Sale" },
      idempotencyKey: "idem-retry",
    });
    const first = await h.service.execute(ctx(), { campaignId: draft.id });
    assert.equal(first.queuedCount, 1);
    assert.equal(h.sendCalls.length, 1);

    // Force status back to failed so execute can reclaim, but recipient stays queued.
    const camp = h.campaigns.find((c) => c.id === draft.id)!;
    camp.status = "failed";
    camp.completed_at = null;

    const second = await h.service.execute(ctx(), { campaignId: draft.id });
    assert.equal(h.sendCalls.length, 1);
    assert.equal(second.queuedCount, 1);
    assert.equal(h.recipients.length, 1);
  });

  it("14. concurrent claim: unique recipient insert returns null for loser", async () => {
    const h = createHarness({ customers: baseCustomers, prefs: marketingOn });
    const draft = await h.service.createDraft(ctx(), {
      name: "Promo",
      audience: { type: "manual", customerIds: ["cu-1"] },
      content: { campaignTitle: "Hi", detail: "Sale" },
      idempotencyKey: "idem-conc",
    });
    const repo = new (await import("./repository.ts")).MarketingCampaignRepository(
      h.client as never,
    );
    const first = await repo.tryClaimRecipient({
      campaign_id: draft.id,
      company_id: "co-1",
      customer_id: "cu-1",
      channel: "whatsapp",
    });
    const second = await repo.tryClaimRecipient({
      campaign_id: draft.id,
      company_id: "co-1",
      customer_id: "cu-1",
      channel: "whatsapp",
    });
    assert.ok(first);
    assert.equal(second, null);
  });

  it("15. partial success — queued + skipped", async () => {
    const customers = [
      ...baseCustomers.filter((c) => c.id === "cu-1"),
      {
        id: "cu-no-phone",
        company_id: "co-1",
        name: "NoPhone",
        phone: null,
        email: null,
        age: 22,
        gender: "male",
        created_at: "2026-03-01T00:00:00.000Z",
      },
    ];
    const h = createHarness({
      customers,
      prefs: [
        { customer_id: "cu-1", company_id: "co-1", receive_marketing: true },
        { customer_id: "cu-no-phone", company_id: "co-1", receive_marketing: true },
      ],
    });
    const draft = await h.service.createDraft(ctx(), {
      name: "Promo",
      audience: { type: "manual", customerIds: ["cu-1", "cu-no-phone"] },
      content: { campaignTitle: "Hi", detail: "Sale" },
      idempotencyKey: "idem-partial",
    });
    const result = await h.service.execute(ctx(), { campaignId: draft.id });
    assert.equal(result.queuedCount, 1);
    assert.equal(result.skippedCount, 1);
    assert.equal(result.failedCount, 0);
    assert.equal(result.sentCount, 0);
    assert.equal(result.status, "completed");
  });

  it("company-scoped campaign idempotency on createDraft", async () => {
    const h = createHarness({ customers: baseCustomers, prefs: marketingOn });
    const a = await h.service.createDraft(ctx(), {
      name: "Promo",
      audience: { type: "all" },
      content: { campaignTitle: "Hi", detail: "Sale" },
      idempotencyKey: "same-key",
    });
    const b = await h.service.createDraft(ctx(), {
      name: "Promo 2",
      audience: { type: "all" },
      content: { campaignTitle: "Hi", detail: "Sale" },
      idempotencyKey: "same-key",
    });
    assert.equal(a.id, b.id);
    assert.equal(h.campaigns.length, 1);
  });

  async function createAndExecute(
    h: ReturnType<typeof createHarness>,
    idempotencyKey: string,
  ) {
    const draft = await h.service.createDraft(ctx(), {
      name: "Promo",
      audience: { type: "manual", customerIds: ["cu-1"] },
      content: { campaignTitle: "Hi", detail: "Sale" },
      idempotencyKey,
      channels: ["whatsapp"],
    });
    const result = await h.service.execute(ctx(), { idempotencyKey });
    return { draft, result };
  }

  it("idempotency: first confirm creates one campaign; repeated confirm reuses it", async () => {
    const h = createHarness({ customers: baseCustomers, prefs: marketingOn });
    const first = await createAndExecute(h, "submit-once");
    const second = await createAndExecute(h, "submit-once");
    assert.equal(h.campaigns.length, 1);
    assert.equal(first.draft.id, second.draft.id);
    assert.equal(second.result.reusedExisting, true);
    assert.equal(h.sendCalls.length, 1);
  });

  it("idempotency: double-click parallel create+execute same key → one WA queue", async () => {
    const h = createHarness({ customers: baseCustomers, prefs: marketingOn });
    const [a, b] = await Promise.all([
      createAndExecute(h, "submit-double"),
      createAndExecute(h, "submit-double"),
    ]);
    assert.equal(h.campaigns.length, 1);
    assert.equal(a.draft.id, b.draft.id);
    assert.equal(h.sendCalls.length, 1);
    assert.equal(h.recipients.length, 1);
  });

  it("idempotency: completed campaign execute does not send again", async () => {
    const h = createHarness({ customers: baseCustomers, prefs: marketingOn });
    await createAndExecute(h, "submit-done");
    const again = await h.service.execute(ctx(), { idempotencyKey: "submit-done" });
    assert.equal(again.reusedExisting, true);
    assert.equal(again.status, "completed");
    assert.equal(h.sendCalls.length, 1);
    assert.equal(h.campaigns.length, 1);
  });

  it("idempotency: draft is reused; running path does not create a second campaign", async () => {
    const h = createHarness({ customers: baseCustomers, prefs: marketingOn });
    const draft = await h.service.createDraft(ctx(), {
      name: "Promo",
      audience: { type: "manual", customerIds: ["cu-1"] },
      content: { campaignTitle: "Hi", detail: "Sale" },
      idempotencyKey: "submit-running",
      channels: ["whatsapp"],
    });
    const camp = h.campaigns.find((c) => c.id === draft.id)!;
    camp.status = "running";
    camp.started_at = "2026-08-29T00:00:01.000Z";
    await h.service.execute(ctx(), { idempotencyKey: "submit-running" });
    await h.service.execute(ctx(), { idempotencyKey: "submit-running" });
    assert.equal(h.campaigns.length, 1);
    assert.equal(h.sendCalls.length, 1);
  });
});

describe("Phase 1 audit migration", () => {
  it("16. migration defines audit triggers into audit_logs", () => {
    const migrationPath = join(
      __dirname,
      "../../../../../supabase/migrations/328_marketing_campaigns.sql",
    );
    const sql = readFileSync(migrationPath, "utf8");
    assert.match(sql, /marketing_campaign_write_audit/);
    assert.match(sql, /trg_audit_marketing_campaigns/);
    assert.match(sql, /trg_audit_marketing_campaign_recipients/);
    assert.match(sql, /insert into public\.audit_logs/);
    assert.match(sql, /unique \(campaign_id, customer_id, channel\)/);
    assert.match(sql, /unique \(company_id, idempotency_key\)/);
    assert.match(sql, /campaigns\.view/);
    assert.match(sql, /channels <@ array\['whatsapp'\]::text\[\]/);
    assert.match(sql, /channel text not null check \(channel = 'whatsapp'\)/);
  });
});

describe("17. existing communication regression (marketing template + outcome map)", () => {
  it("marketing_campaign template remains registered", async () => {
    const { communicationTemplateRegistry } = await import(
      "../communication/templates/communication-template-registry.ts"
    );
    const tpl = communicationTemplateRegistry.resolve("marketing_campaign");
    assert.ok(tpl);
    assert.ok(tpl.supportedChannels.includes("whatsapp"));
    assert.ok(tpl.variableKeys.includes("campaignTitle"));
  });

  it("dispatcher outcome mapping never promotes queue to sent", () => {
    const queued = mapDispatcherResultToRecipientOutcome("+1", {
      messageIds: ["n"],
      queueIds: ["q"],
      channelQueueIds: { whatsapp: "q" },
      skippedChannels: [],
      deduplicated: false,
    });
    assert.equal(queued.status, "queued");
  });
});
