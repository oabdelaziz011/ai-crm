import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getWhatsAppPurposeCatalogForApi,
  listCompanyWhatsAppTemplates,
  matchMetaTemplateForPurpose,
  resolveCompanyWhatsAppTemplateForPurpose,
  syncCompanyWhatsAppTemplatesFromMeta,
} from "./whatsapp-company-templates";
import { WhatsAppTemplateSetupError } from "./whatsapp-template-setup-error";
import type { MetaListedWhatsAppTemplate } from "./whatsapp-template-meta-client";

type UpsertCall = {
  table: string;
  payload: Record<string, unknown>;
  onConflict?: string;
};

function createFakeClient(opts?: {
  existingRows?: Array<Record<string, unknown>>;
  failCompanyId?: string;
}) {
  const upserts: UpsertCall[] = [];
  const rowsByCompany = new Map<string, Array<Record<string, unknown>>>();
  for (const row of opts?.existingRows ?? []) {
    const companyId = String(row.company_id);
    const list = rowsByCompany.get(companyId) ?? [];
    list.push(row);
    rowsByCompany.set(companyId, list);
  }

  const client = {
    from(table: string) {
      return {
        select(_cols?: string) {
          return {
            eq(column: string, value: string) {
              if (column !== "company_id") {
                return this;
              }
              const companyId = value;
              return {
                eq(column2: string, value2: string) {
                  const all = rowsByCompany.get(companyId) ?? [];
                  const filtered = all.filter((r) => String(r[column2]) === value2);
                  return {
                    async then(resolve: (v: unknown) => unknown) {
                      return resolve({ data: filtered, error: null });
                    },
                    data: filtered,
                    error: null,
                  };
                },
                order() {
                  const all = rowsByCompany.get(companyId) ?? [];
                  return Promise.resolve({ data: all, error: null });
                },
                then(resolve: (v: unknown) => unknown) {
                  const all = rowsByCompany.get(companyId) ?? [];
                  return resolve({ data: all, error: null });
                },
              };
            },
          };
        },
        upsert(payload: Record<string, unknown>, options?: { onConflict?: string }) {
          upserts.push({ table, payload, onConflict: options?.onConflict });
          if (opts?.failCompanyId && payload.company_id === opts.failCompanyId) {
            return Promise.resolve({ error: { message: "isolation violation" } });
          }
          const companyId = String(payload.company_id);
          const list = rowsByCompany.get(companyId) ?? [];
          const key = `${payload.purpose_key}|${payload.language_code}`;
          const idx = list.findIndex(
            (r) => `${r.purpose_key}|${r.language_code}` === key,
          );
          const row = {
            id: idx >= 0 ? list[idx]!.id : `id-${list.length + 1}`,
            created_at: "2026-01-01T00:00:00.000Z",
            updated_at: payload.updated_at,
            ...payload,
          };
          if (idx >= 0) list[idx] = row;
          else list.push(row);
          rowsByCompany.set(companyId, list);
          return Promise.resolve({ error: null });
        },
      };
    },
  };

  return { client: client as never, upserts, rowsByCompany };
}

const listed: MetaListedWhatsAppTemplate[] = [
  {
    id: "tpl-1",
    name: "valueor_delivery_worker_dispatch",
    language: "en_US",
    status: "APPROVED",
    category: "UTILITY",
  },
  {
    id: "tpl-2",
    name: "valueor_order_confirmed",
    language: "en_US",
    status: "PENDING",
    category: "UTILITY",
  },
];

describe("whatsapp-company-templates", () => {
  it("exposes purpose catalog from WHATSAPP_PURPOSE_TEMPLATE_SPECS", () => {
    const catalog = getWhatsAppPurposeCatalogForApi();
    assert.ok(catalog.length > 0);
    assert.ok(catalog.some((c) => c.purpose === "delivery_worker_dispatch"));
  });

  it("matches Meta templates by recommended name + language", () => {
    const match = matchMetaTemplateForPurpose("delivery_worker_dispatch", listed);
    assert.ok(match);
    assert.equal(match?.id, "tpl-1");
    assert.equal(match?.status, "APPROVED");
  });

  it("syncs Meta statuses into company-scoped rows without creating on Meta", async () => {
    const companyA = "11111111-1111-1111-1111-111111111111";
    const companyB = "22222222-2222-2222-2222-222222222222";
    const { client, upserts, rowsByCompany } = createFakeClient();

    const resultA = await syncCompanyWhatsAppTemplatesFromMeta(client, {
      companyId: companyA,
      accessToken: "token",
      businessAccountId: "waba",
      listedTemplates: listed,
    });

    assert.equal(resultA.companyId, companyA);
    assert.ok(resultA.upserted > 0);
    assert.ok(resultA.approved >= 1);
    assert.ok(upserts.every((u) => u.payload.company_id === companyA));
    assert.ok(upserts.every((u) => u.onConflict === "company_id,purpose_key,language_code"));

    const worker = resultA.templates.find((t) => t.purposeKey === "delivery_worker_dispatch");
    assert.equal(worker?.metaStatus, "APPROVED");
    const confirmed = resultA.templates.find(
      (t) => t.purposeKey === "customer_order_status_confirmed",
    );
    assert.equal(confirmed?.metaStatus, "PENDING");

    await syncCompanyWhatsAppTemplatesFromMeta(client, {
      companyId: companyB,
      accessToken: "token",
      businessAccountId: "waba",
      listedTemplates: listed,
    });

    assert.ok(rowsByCompany.has(companyA));
    assert.ok(rowsByCompany.has(companyB));
    assert.equal(
      (rowsByCompany.get(companyA) ?? []).every((r) => r.company_id === companyA),
      true,
    );
    assert.equal(
      (rowsByCompany.get(companyB) ?? []).every((r) => r.company_id === companyB),
      true,
    );
  });

  it("prevents duplicate purpose/language rows via upsert conflict key", async () => {
    const companyId = "11111111-1111-1111-1111-111111111111";
    const { client, rowsByCompany } = createFakeClient();

    await syncCompanyWhatsAppTemplatesFromMeta(client, {
      companyId,
      accessToken: "token",
      businessAccountId: "waba",
      listedTemplates: listed,
    });
    const afterFirst = (rowsByCompany.get(companyId) ?? []).length;

    await syncCompanyWhatsAppTemplatesFromMeta(client, {
      companyId,
      accessToken: "token",
      businessAccountId: "waba",
      listedTemplates: listed,
    });
    const afterSecond = (rowsByCompany.get(companyId) ?? []).length;
    assert.equal(afterSecond, afterFirst);
  });

  it("soft-fails resolve when company_whatsapp_templates relation is missing", async () => {
    const client = {
      from() {
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return Promise.resolve({
                      data: null,
                      error: {
                        code: "42P01",
                        message: 'relation "public.company_whatsapp_templates" does not exist',
                      },
                    });
                  },
                };
              },
            };
          },
        };
      },
    };
    const row = await resolveCompanyWhatsAppTemplateForPurpose(client as never, {
      companyId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      purpose: "delivery_worker_dispatch",
    });
    assert.equal(row, null);
  });

  it("list throws WHATSAPP_TEMPLATE_SETUP_PENDING when table is missing", async () => {
    const client = {
      from() {
        return {
          select() {
            return {
              eq() {
                return {
                  order() {
                    return Promise.resolve({
                      data: null,
                      error: {
                        code: "PGRST205",
                        message:
                          "Could not find the table 'public.company_whatsapp_templates' in the schema cache",
                      },
                    });
                  },
                };
              },
            };
          },
        };
      },
    };
    await assert.rejects(
      () => listCompanyWhatsAppTemplates(client as never, "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"),
      (err: unknown) =>
        err instanceof WhatsAppTemplateSetupError &&
        err.code === "WHATSAPP_TEMPLATE_SETUP_PENDING",
    );
  });

  it("scopes list reads by company_id", async () => {
    const companyA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const companyB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    const { client } = createFakeClient({
      existingRows: [
        {
          id: "1",
          company_id: companyA,
          purpose_key: "delivery_worker_dispatch",
          language_code: "en_US",
          meta_template_name: "valueor_delivery_worker_dispatch",
          meta_template_id: "tpl-1",
          meta_status: "APPROVED",
          category: "UTILITY",
          recipient: "worker",
          last_synced_at: null,
          last_error: null,
          last_error_code: null,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "2",
          company_id: companyB,
          purpose_key: "delivery_worker_dispatch",
          language_code: "en_US",
          meta_template_name: "valueor_delivery_worker_dispatch",
          meta_template_id: "tpl-9",
          meta_status: "REJECTED",
          category: "UTILITY",
          recipient: "worker",
          last_synced_at: null,
          last_error: null,
          last_error_code: null,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        },
      ],
    });

    const onlyA = await listCompanyWhatsAppTemplates(client, companyA);
    assert.equal(onlyA.length, 1);
    assert.equal(onlyA[0]?.companyId, companyA);
    assert.equal(onlyA[0]?.metaStatus, "APPROVED");

    const onlyB = await listCompanyWhatsAppTemplates(client, companyB);
    assert.equal(onlyB.length, 1);
    assert.equal(onlyB[0]?.companyId, companyB);
    assert.equal(onlyB[0]?.metaStatus, "REJECTED");
  });
});
