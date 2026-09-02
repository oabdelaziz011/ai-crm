/**
 * Phase 2H.2 — audience resolver vs live public.customers schema.
 * Mocks only. No campaigns, queue rows, providers, or customer writes.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { CampaignAudienceResolver } from "./audience-resolver.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Columns present on live public.customers (no soft-delete). */
type LiveCustomerRow = {
  id: string;
  company_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  age: number | null;
  gender: string | null;
  created_at: string;
  updated_at?: string;
  user_id?: string;
  notes?: string | null;
};

type PrefRow = { customer_id: string; company_id: string; receive_marketing: boolean };

function createLiveSchemaClient(options: {
  customers: LiveCustomerRow[];
  prefs: PrefRow[];
}) {
  const { customers, prefs } = options;
  let customerMutations = 0;
  let campaignQueries = 0;
  let queueQueries = 0;
  let providerCalls = 0;

  const client = {
    from: (table: string) => {
      if (table === "customers") {
        const filters: Record<string, unknown> = {};
        let idsIn: string[] | null = null;
        const chain: Record<string, unknown> = {};
        chain.select = (cols?: string) => {
          if (typeof cols === "string" && /\bdeleted_at\b/.test(cols)) {
            return {
              then: (
                onfulfilled: (v: unknown) => unknown,
                onrejected?: (e: unknown) => unknown,
              ) =>
                Promise.resolve({
                  data: null,
                  error: {
                    message:
                      'column customers.deleted_at does not exist',
                    code: "42703",
                  },
                }).then(onfulfilled, onrejected),
            };
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
        chain.is = (col: string) => {
          if (col === "deleted_at") {
            return {
              then: (
                onfulfilled: (v: unknown) => unknown,
                onrejected?: (e: unknown) => unknown,
              ) =>
                Promise.resolve({
                  data: null,
                  error: {
                    message:
                      'column customers.deleted_at does not exist',
                    code: "42703",
                  },
                }).then(onfulfilled, onrejected),
            };
          }
          return chain;
        };
        chain.insert = () => {
          customerMutations += 1;
          throw new Error("customer writes forbidden in audience schema tests");
        };
        chain.update = () => {
          customerMutations += 1;
          throw new Error("customer writes forbidden in audience schema tests");
        };
        chain.delete = () => {
          customerMutations += 1;
          throw new Error("customer writes forbidden in audience schema tests");
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
        chain.update = () => {
          customerMutations += 1;
          throw new Error("preference writes forbidden in audience schema tests");
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

      if (table === "marketing_campaigns" || table === "marketing_campaign_recipients") {
        campaignQueries += 1;
        throw new Error(`unexpected ${table} access in audience-only regression`);
      }
      if (table === "notification_queue") {
        queueQueries += 1;
        throw new Error("unexpected notification_queue access");
      }
      providerCalls += 1;
      throw new Error(`unexpected table ${table}`);
    },
  };

  return {
    client,
    counters: () => ({
      customerMutations,
      campaignQueries,
      queueQueries,
      providerCalls,
    }),
  };
}

const liveCustomers: LiveCustomerRow[] = [
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

describe("Audience schema regression (2H.2)", () => {
  it("1. audience-resolver source never references customers.deleted_at", () => {
    const src = readFileSync(join(__dirname, "audience-resolver.ts"), "utf8");
    assert.ok(!/\.is\(\s*["']deleted_at["']/.test(src));
    assert.ok(!/CUSTOMER_SELECT\s*=\s*[^;]*deleted_at/.test(src));
    assert.ok(!/\bdeleted_at\b/.test(src));
  });

  it("2-4. all / filtered / manual resolve against live-shaped customers schema", async () => {
    const { client, counters } = createLiveSchemaClient({
      customers: liveCustomers,
      prefs: [
        { customer_id: "cu-1", company_id: "co-1", receive_marketing: true },
        { customer_id: "cu-2", company_id: "co-1", receive_marketing: true },
        { customer_id: "cu-3", company_id: "co-2", receive_marketing: true },
      ],
    });
    const audience = new CampaignAudienceResolver(client as never);

    const all = await audience.resolve("co-1", { type: "all" });
    assert.deepEqual(
      all.customers.map((c) => c.id).sort(),
      ["cu-1", "cu-2"],
    );

    const filtered = await audience.resolve("co-1", {
      type: "filtered",
      filters: { gender: "female", ageMin: 18, ageMax: 35 },
    });
    assert.deepEqual(
      filtered.customers.map((c) => c.id),
      ["cu-1"],
    );

    const manual = await audience.resolve("co-1", {
      type: "manual",
      customerIds: ["cu-1", "cu-2", "cu-2"],
    });
    assert.deepEqual(
      manual.customers.map((c) => c.id).sort(),
      ["cu-1", "cu-2"],
    );

    assert.deepEqual(counters(), {
      customerMutations: 0,
      campaignQueries: 0,
      queueQueries: 0,
      providerCalls: 0,
    });
  });

  it("5. company isolation — other-company IDs excluded from manual", async () => {
    const { client } = createLiveSchemaClient({
      customers: liveCustomers,
      prefs: [
        { customer_id: "cu-1", company_id: "co-1", receive_marketing: true },
        { customer_id: "cu-3", company_id: "co-2", receive_marketing: true },
      ],
    });
    const audience = new CampaignAudienceResolver(client as never);
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

  it("6. receive_marketing=false excluded", async () => {
    const { client } = createLiveSchemaClient({
      customers: liveCustomers,
      prefs: [
        { customer_id: "cu-1", company_id: "co-1", receive_marketing: true },
        { customer_id: "cu-2", company_id: "co-1", receive_marketing: false },
      ],
    });
    const audience = new CampaignAudienceResolver(client as never);
    const result = await audience.resolve("co-1", { type: "all" });
    assert.deepEqual(
      result.customers.map((c) => c.id),
      ["cu-1"],
    );
    assert.equal(result.excludedOptedOutCount, 1);
  });

  it("7. missing marketing preferences excluded", async () => {
    const { client } = createLiveSchemaClient({
      customers: liveCustomers,
      prefs: [{ customer_id: "cu-1", company_id: "co-1", receive_marketing: true }],
    });
    const audience = new CampaignAudienceResolver(client as never);
    const result = await audience.resolve("co-1", { type: "all" });
    assert.deepEqual(
      result.customers.map((c) => c.id),
      ["cu-1"],
    );
    assert.equal(result.excludedOptedOutCount, 1);
  });

  it("8-11. resolve does not mutate customers, create campaigns, queue, or call providers", async () => {
    const { client, counters } = createLiveSchemaClient({
      customers: liveCustomers,
      prefs: [
        { customer_id: "cu-1", company_id: "co-1", receive_marketing: true },
        { customer_id: "cu-2", company_id: "co-1", receive_marketing: true },
      ],
    });
    const audience = new CampaignAudienceResolver(client as never);
    await audience.resolve("co-1", {
      type: "manual",
      customerIds: ["cu-1", "ghost"],
    });
    assert.deepEqual(counters(), {
      customerMutations: 0,
      campaignQueries: 0,
      queueQueries: 0,
      providerCalls: 0,
    });
  });
});
