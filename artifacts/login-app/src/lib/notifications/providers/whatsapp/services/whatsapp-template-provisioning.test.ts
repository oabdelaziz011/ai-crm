import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { provisionCompanyWhatsAppTemplates } from "./whatsapp-template-provisioning";
import type { MetaListedWhatsAppTemplate } from "./whatsapp-template-meta-client";

type Row = Record<string, unknown>;

function createFakeClient() {
  const rowsByCompany = new Map<string, Row[]>();
  const client = {
    from(_table: string) {
      return {
        upsert(payload: Row) {
          const companyId = String(payload.company_id);
          const list = rowsByCompany.get(companyId) ?? [];
          const key = `${payload.purpose_key}|${payload.language_code}`;
          const idx = list.findIndex((r) => `${r.purpose_key}|${r.language_code}` === key);
          const row = {
            id: idx >= 0 ? list[idx]!.id : `id-${companyId}-${list.length + 1}`,
            created_at: "2026-01-01T00:00:00.000Z",
            updated_at: payload.updated_at,
            ...payload,
          };
          if (idx >= 0) list[idx] = row;
          else list.push(row);
          rowsByCompany.set(companyId, list);
          return Promise.resolve({ error: null });
        },
        select() {
          return {
            eq(column: string, value: string) {
              if (column !== "company_id") return this;
              const companyId = value;
              return {
                order() {
                  return Promise.resolve({
                    data: rowsByCompany.get(companyId) ?? [],
                    error: null,
                  });
                },
                eq() {
                  return {
                    then(resolve: (v: unknown) => unknown) {
                      return resolve({ data: rowsByCompany.get(companyId) ?? [], error: null });
                    },
                  };
                },
              };
            },
          };
        },
        update() {
          return {
            eq() {
              return {
                eq() {
                  return {
                    select() {
                      return Promise.resolve({ data: [], error: null });
                    },
                  };
                },
                select() {
                  return Promise.resolve({ data: [], error: null });
                },
              };
            },
          };
        },
      };
    },
  };
  return { client: client as never, rowsByCompany };
}

describe("whatsapp-template-provisioning", () => {
  it("isolates company A and B and reuses existing Meta templates without duplicates", async () => {
    const companyA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const companyB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    const { client, rowsByCompany } = createFakeClient();

    const listedA: MetaListedWhatsAppTemplate[] = [
      {
        id: "a1",
        name: "valueor_delivery_worker_dispatch",
        language: "en_US",
        status: "APPROVED",
        category: "UTILITY",
      },
    ];

    const fetchCalls: Array<{ method: string; url: string; body?: string }> = [];
    const fetchFn = async (url: string, init?: RequestInit) => {
      const method = String(init?.method ?? "GET");
      fetchCalls.push({
        method,
        url,
        body: typeof init?.body === "string" ? init.body : undefined,
      });
      if (method === "GET") {
        return new Response(JSON.stringify({ data: listedA }), { status: 200 });
      }
      // create
      const body = JSON.parse(String(init?.body ?? "{}")) as { name?: string };
      listedA.push({
        id: `new-${listedA.length}`,
        name: String(body.name),
        language: "en_US",
        status: "PENDING",
        category: "UTILITY",
      });
      return new Response(
        JSON.stringify({ id: `new-${listedA.length}`, status: "PENDING", category: "UTILITY" }),
        { status: 200 },
      );
    };

    const resultA = await provisionCompanyWhatsAppTemplates(client, {
      companyId: companyA,
      accessToken: "token-a",
      businessAccountId: "waba-a",
      listedTemplates: listedA,
      fetchFn: fetchFn as typeof fetch,
    });

    assert.ok(resultA.reused >= 1);
    assert.ok(resultA.created >= 1);
    assert.ok((rowsByCompany.get(companyA) ?? []).every((r) => r.company_id === companyA));

    const beforeSecond = (rowsByCompany.get(companyA) ?? []).length;
    const again = await provisionCompanyWhatsAppTemplates(client, {
      companyId: companyA,
      accessToken: "token-a",
      businessAccountId: "waba-a",
      listedTemplates: listedA,
      fetchFn: fetchFn as typeof fetch,
    });
    assert.equal(again.created, 0);
    assert.ok(again.reused >= 1);
    assert.equal((rowsByCompany.get(companyA) ?? []).length, beforeSecond);

    const listedB: MetaListedWhatsAppTemplate[] = [];
    await provisionCompanyWhatsAppTemplates(client, {
      companyId: companyB,
      accessToken: "token-b",
      businessAccountId: "waba-b",
      listedTemplates: listedB,
      fetchFn: async (url, init) => {
        const method = String(init?.method ?? "GET");
        if (method === "GET") {
          return new Response(JSON.stringify({ data: listedB }), { status: 200 });
        }
        const body = JSON.parse(String(init?.body ?? "{}")) as { name?: string };
        listedB.push({
          id: `b-${listedB.length}`,
          name: String(body.name),
          language: "en_US",
          status: "PENDING",
          category: "UTILITY",
        });
        return new Response(
          JSON.stringify({ id: `b-${listedB.length}`, status: "PENDING", category: "UTILITY" }),
          { status: 200 },
        );
      },
    });

    assert.ok((rowsByCompany.get(companyB) ?? []).every((r) => r.company_id === companyB));
    assert.ok(!(rowsByCompany.get(companyA) ?? []).some((r) => r.company_id === companyB));
  });

  it("never provisions connection_test / hello_world as transactional", async () => {
    const companyId = "cccccccc-cccc-cccc-cccc-cccccccccccc";
    const { client } = createFakeClient();
    const result = await provisionCompanyWhatsAppTemplates(client, {
      companyId,
      accessToken: "token",
      businessAccountId: "waba",
      listedTemplates: [],
      fetchFn: async (_url, init) => {
        if (String(init?.method ?? "GET") === "GET") {
          return new Response(JSON.stringify({ data: [] }), { status: 200 });
        }
        const body = JSON.parse(String(init?.body ?? "{}")) as { name?: string };
        assert.notEqual(body.name, "hello_world");
        return new Response(
          JSON.stringify({ id: "x", status: "PENDING", category: "UTILITY" }),
          { status: 200 },
        );
      },
    });
    assert.equal(
      result.purposes.some((p) => p.purpose === "connection_test"),
      false,
    );
  });
});
