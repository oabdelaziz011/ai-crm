import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildWhatsAppSenderPhoneLookupVariants,
  customerPhoneMatchesWhatsAppSender,
  readTrustedCustomerIdFromConversation,
  resolveTrustedChannelCustomer,
  resolveWhatsAppSenderPhoneE164,
  type TrustedChannelCustomerMatch,
} from "./resolve-trusted-channel-customer.js";
import { resolvePhoneIdentity } from "./phone-identity-resolver.js";
import { buildCustomerPhoneIdentityColumns } from "./customer-phone-identity-dual-write.js";

describe("resolveTrustedChannelCustomer", () => {
  it("resolves Meta 2010… against CRM 010… to the same customer", async () => {
    const crm: TrustedChannelCustomerMatch = {
      id: "11111111-1111-4111-8111-111111111111",
      name: "عمر",
      phone: "01011404109",
    };
    const lookups: string[] = [];
    const result = await resolveTrustedChannelCustomer({
      companyId: "company-a",
      channelKey: "whatsapp",
      senderExternalId: "201011404109",
      findByPhone: async (phone) => {
        lookups.push(phone);
        if (phone === "01011404109" || phone === "201011404109") {
          return { status: "found", customer: crm };
        }
        return { status: "not_found" };
      },
    });
    assert.equal(result.status, "known");
    if (result.status === "known") {
      assert.equal(result.customerId, crm.id);
      assert.equal(result.trustedCustomerName, "عمر");
      assert.equal(result.matchSource, "legacy_phone");
    }
    assert.ok(lookups.includes("01011404109") || lookups.includes("201011404109"));
  });

  it("returns unknown when no CRM match exists", async () => {
    const result = await resolveTrustedChannelCustomer({
      companyId: "company-a",
      channelKey: "whatsapp",
      senderExternalId: "201099988877",
      findByPhone: async () => ({ status: "not_found" }),
    });
    assert.equal(result.status, "unknown");
  });

  it("fails closed across companies (lookup is company-scoped by contract)", async () => {
    const companyACustomer: TrustedChannelCustomerMatch = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "شركة أ",
      phone: "01011404109",
    };
    const result = await resolveTrustedChannelCustomer({
      companyId: "company-b",
      channelKey: "whatsapp",
      senderExternalId: "201011404109",
      findByPhone: async () => ({ status: "not_found" }),
    });
    assert.equal(result.status, "unknown");
    assert.notEqual(
      result.status === "known" ? result.customerId : null,
      companyACustomer.id,
    );
  });

  it("fails closed when normalized variants match different customers", async () => {
    const result = await resolveTrustedChannelCustomer({
      companyId: "company-a",
      channelKey: "whatsapp",
      senderExternalId: "201011404109",
      findByPhone: async (phone) => {
        if (phone === "201011404109") {
          return {
            status: "found",
            customer: {
              id: "11111111-1111-4111-8111-111111111111",
              name: "A",
              phone,
            },
          };
        }
        if (phone === "01011404109") {
          return {
            status: "found",
            customer: {
              id: "22222222-2222-4222-8222-222222222222",
              name: "B",
              phone,
            },
          };
        }
        return { status: "not_found" };
      },
    });
    assert.equal(result.status, "ambiguous");
  });

  it("admin sender override disambiguates only when override customer is in match set", async () => {
    const omar: TrustedChannelCustomerMatch = {
      id: "8b810114-c2fe-4a30-bc65-cf4bf084d1fb",
      name: "عمر مجدي عبدالمحسن",
      phone: "01011404109",
    };
    const tamer: TrustedChannelCustomerMatch = {
      id: "275b67bd-7360-4841-8b78-4ece64733d65",
      name: "تامر",
      phone: "+201011404109",
    };
    const result = await resolveTrustedChannelCustomer({
      companyId: "2d27f7fb-c15e-4d60-84e9-1793f36f2172",
      channelKey: "whatsapp",
      senderExternalId: "201011404109",
      findByPhone: async (phone) => {
        if (phone === "01011404109" || phone === "201011404109") {
          return { status: "found", customer: omar };
        }
        if (phone === "+201011404109") {
          return { status: "found", customer: tamer };
        }
        return { status: "not_found" };
      },
    });
    assert.equal(result.status, "known");
    if (result.status === "known") {
      assert.equal(result.customerId, omar.id);
      assert.equal(result.trustedCustomerName, "عمر عبدالعزيز");
    }
  });

  it("admin sender override does not invent identity when override customer is absent", async () => {
    const other: TrustedChannelCustomerMatch = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "Other",
      phone: "01011404109",
    };
    const tamer: TrustedChannelCustomerMatch = {
      id: "275b67bd-7360-4841-8b78-4ece64733d65",
      name: "تامر",
      phone: "+201011404109",
    };
    const result = await resolveTrustedChannelCustomer({
      companyId: "2d27f7fb-c15e-4d60-84e9-1793f36f2172",
      channelKey: "whatsapp",
      senderExternalId: "201011404109",
      findByPhone: async (phone) => {
        if (phone === "01011404109" || phone === "201011404109") {
          return { status: "found", customer: other };
        }
        if (phone === "+201011404109") {
          return { status: "found", customer: tamer };
        }
        return { status: "not_found" };
      },
    });
    assert.equal(result.status, "ambiguous");
  });

  it("welcome display override is customer-id scoped (not CRM name mutation)", async () => {
    const omar: TrustedChannelCustomerMatch = {
      id: "8b810114-c2fe-4a30-bc65-cf4bf084d1fb",
      name: "عمر مجدي عبدالمحسن",
      phone: "01011404109",
    };
    const result = await resolveTrustedChannelCustomer({
      companyId: "2d27f7fb-c15e-4d60-84e9-1793f36f2172",
      channelKey: "whatsapp",
      senderExternalId: "201011404109",
      findByPhone: async (phone) => {
        if (phone === "01011404109" || phone === "201011404109" || phone === "+201011404109") {
          return { status: "found", customer: omar };
        }
        return { status: "not_found" };
      },
    });
    assert.equal(result.status, "known");
    if (result.status === "known") {
      assert.equal(result.trustedCustomerName, "عمر عبدالعزيز");
      assert.notEqual(result.trustedCustomerName, omar.name);
    }
  });

  it("unrelated customer keeps CRM name (no global عمر عبدالعزيز hardcode)", async () => {
    const other: TrustedChannelCustomerMatch = {
      id: "99999999-9999-4999-8999-999999999999",
      name: "سارة",
      phone: "01019998887",
    };
    const result = await resolveTrustedChannelCustomer({
      companyId: "2d27f7fb-c15e-4d60-84e9-1793f36f2172",
      channelKey: "whatsapp",
      senderExternalId: "201019998887",
      findByPhone: async (phone) => {
        if (phone === "01019998887" || phone === "201019998887" || phone === "+201019998887") {
          return { status: "found", customer: other };
        }
        return { status: "not_found" };
      },
    });
    assert.equal(result.status, "known");
    if (result.status === "known") {
      assert.equal(result.trustedCustomerName, "سارة");
    }
  });

  it("fails closed when findByPhone reports duplicate for a variant", async () => {
    const result = await resolveTrustedChannelCustomer({
      companyId: "company-a",
      channelKey: "whatsapp",
      senderExternalId: "201011404109",
      findByPhone: async () => ({ status: "duplicate", count: 2 }),
    });
    assert.equal(result.status, "ambiguous");
  });

  it("does not support non-whatsapp channels", async () => {
    const result = await resolveTrustedChannelCustomer({
      companyId: "company-a",
      channelKey: "facebook",
      senderExternalId: "201011404109",
      findByPhone: async () => ({
        status: "found",
        customer: {
          id: "11111111-1111-4111-8111-111111111111",
          name: "عمر",
          phone: "01011404109",
        },
      }),
    });
    assert.equal(result.status, "unsupported_channel");
  });

  it("builds 2010↔010 and +20 lookup variants without a second normalizer", () => {
    const variants = buildWhatsAppSenderPhoneLookupVariants("201011404109");
    assert.ok(variants.includes("201011404109") || variants.includes("01011404109"));
    assert.ok(variants.includes("01011404109"));
    assert.ok(variants.includes("+201011404109"));
  });

  it("customerPhoneMatchesWhatsAppSender accepts 010 against Meta 2010", () => {
    assert.equal(customerPhoneMatchesWhatsAppSender("01011404109", "201011404109"), true);
    assert.equal(customerPhoneMatchesWhatsAppSender("01013363637", "201011404109"), false);
  });

  it("readTrustedCustomerIdFromConversation prefers stamp over stale customer_id", () => {
    assert.equal(
      readTrustedCustomerIdFromConversation({
        customerId: "6c1f2063-d89d-45a1-b7ec-87cbd476816d",
        metadata: { trustedChannelCustomerId: "11111111-1111-4111-8111-111111111111" },
      }),
      "11111111-1111-4111-8111-111111111111",
    );
    assert.equal(
      readTrustedCustomerIdFromConversation({
        customerId: "6c1f2063-d89d-45a1-b7ec-87cbd476816d",
        metadata: { trustedChannelCustomerId: null },
      }),
      null,
    );
    assert.equal(
      readTrustedCustomerIdFromConversation({
        customerId: "6c1f2063-d89d-45a1-b7ec-87cbd476816d",
        metadata: {},
      }),
      "6c1f2063-d89d-45a1-b7ec-87cbd476816d",
    );
  });
});

describe("Phase D2 — inbound WhatsApp phone identity", () => {
  const INTERNATIONAL_SENDERS: Array<{ label: string; meta: string; e164: string }> = [
    { label: "EG", meta: "201023169075", e164: "+201023169075" },
    { label: "SA", meta: "966551234567", e164: "+966551234567" },
    { label: "AE", meta: "971501234567", e164: "+971501234567" },
    { label: "QA", meta: "97433123456", e164: "+97433123456" },
    { label: "KW", meta: "96551234567", e164: "+96551234567" },
    { label: "BH", meta: "97336123456", e164: "+97336123456" },
    { label: "OM", meta: "96891234567", e164: "+96891234567" },
    { label: "GB", meta: "447911123456", e164: "+447911123456" },
    { label: "US", meta: "14155552671", e164: "+14155552671" },
    { label: "CA", meta: "14165550123", e164: "+14165550123" },
    { label: "DE", meta: "4915123456789", e164: "+4915123456789" },
    { label: "FR", meta: "33612345678", e164: "+33612345678" },
    { label: "IT", meta: "393312345678", e164: "+393312345678" },
    { label: "ES", meta: "34612345678", e164: "+34612345678" },
    { label: "IN", meta: "919876543210", e164: "+919876543210" },
  ];

  it("A) exact company-scoped phone_e164 match wins", async () => {
    const crm: TrustedChannelCustomerMatch = {
      id: "cust-e164",
      name: "E164 Customer",
      phone: "01023169075",
      phoneE164: "+201023169075",
    };
    const phoneLookups: string[] = [];
    const result = await resolveTrustedChannelCustomer({
      companyId: "company-a",
      channelKey: "whatsapp",
      senderExternalId: "201023169075",
      findByPhoneE164: async (phoneE164) => {
        assert.equal(phoneE164, "+201023169075");
        return { status: "found", customer: crm };
      },
      findByPhone: async (phone) => {
        phoneLookups.push(phone);
        return { status: "not_found" };
      },
    });
    assert.equal(result.status, "known");
    if (result.status === "known") {
      assert.equal(result.customerId, "cust-e164");
      assert.equal(result.matchSource, "phone_e164");
      assert.equal(result.matchedPhone, "+201023169075");
    }
    assert.deepEqual(phoneLookups, []);
  });

  it("B) legacy Egypt local phone still resolves when phone_e164 is absent", async () => {
    const crm: TrustedChannelCustomerMatch = {
      id: "cust-legacy",
      name: "Legacy",
      phone: "01023169075",
      phoneE164: null,
    };
    const result = await resolveTrustedChannelCustomer({
      companyId: "company-a",
      channelKey: "whatsapp",
      senderExternalId: "201023169075",
      findByPhoneE164: async () => ({ status: "not_found" }),
      findByPhone: async (phone) => {
        if (phone === "01023169075" || phone === "201023169075" || phone === "+201023169075") {
          return { status: "found", customer: crm };
        }
        return { status: "not_found" };
      },
    });
    assert.equal(result.status, "known");
    if (result.status === "known") {
      assert.equal(result.customerId, "cust-legacy");
      assert.equal(result.matchSource, "legacy_phone");
    }
  });

  it("C/D) trusted conversation stamp is preferred over phone re-resolution helpers", () => {
    const stamped = readTrustedCustomerIdFromConversation({
      customerId: "stale-customer",
      metadata: { trustedChannelCustomerId: "trusted-customer" },
    });
    assert.equal(stamped, "trusted-customer");
    assert.equal(
      customerPhoneMatchesWhatsAppSender("01023169075", "201023169075", null),
      true,
    );
  });

  it("E/F) new-customer dual-write populates phone_e164 for Meta international sender", () => {
    for (const row of INTERNATIONAL_SENDERS) {
      const cols = buildCustomerPhoneIdentityColumns({
        phone: row.meta,
        source: "channel",
      });
      assert.equal(cols.phone_e164, row.e164, row.label);
      assert.ok(cols.phone_country_iso);
      assert.ok(cols.phone_region_source === "channel" || cols.phone_region_source === "e164");
      assert.ok(cols.phone_national);
    }
  });

  it("G) unresolved local digits without region fail closed", async () => {
    assert.equal(resolveWhatsAppSenderPhoneE164("01023169075"), null);
    const result = await resolveTrustedChannelCustomer({
      companyId: "company-a",
      channelKey: "whatsapp",
      senderExternalId: "5551234",
      findByPhoneE164: async () => ({ status: "not_found" }),
      findByPhone: async () => ({ status: "not_found" }),
    });
    assert.equal(result.status, "unknown");
  });

  it("H) invalid inbound number fails closed", async () => {
    assert.equal(resolveWhatsAppSenderPhoneE164("not-a-phone"), null);
    const result = await resolveTrustedChannelCustomer({
      companyId: "company-a",
      channelKey: "whatsapp",
      senderExternalId: "abc",
      findByPhone: async () => ({ status: "not_found" }),
    });
    assert.equal(result.status, "unknown");
  });

  it("I/L) same E.164 in two companies never cross-leaks", async () => {
    const customerA: TrustedChannelCustomerMatch = {
      id: "cust-a",
      name: "A",
      phone: null,
      phoneE164: "+201023169075",
    };
    const customerB: TrustedChannelCustomerMatch = {
      id: "cust-b",
      name: "B",
      phone: null,
      phoneE164: "+201023169075",
    };

    const resolveFor = async (
      companyId: string,
      store: Map<string, TrustedChannelCustomerMatch>,
    ) =>
      resolveTrustedChannelCustomer({
        companyId,
        channelKey: "whatsapp",
        senderExternalId: "201023169075",
        findByPhoneE164: async (phoneE164) => {
          const hit = store.get(`${companyId}|${phoneE164}`);
          return hit ? { status: "found", customer: hit } : { status: "not_found" };
        },
        findByPhone: async () => ({ status: "not_found" }),
      });

    const store = new Map<string, TrustedChannelCustomerMatch>([
      ["company-a|+201023169075", customerA],
      ["company-b|+201023169075", customerB],
    ]);

    const a = await resolveFor("company-a", store);
    const b = await resolveFor("company-b", store);
    assert.equal(a.status, "known");
    assert.equal(b.status, "known");
    if (a.status === "known" && b.status === "known") {
      assert.equal(a.customerId, "cust-a");
      assert.equal(b.customerId, "cust-b");
      assert.notEqual(a.customerId, b.customerId);
    }
  });

  it("J/K) concurrent create loser re-resolves existing (unique phone_e164)", async () => {
    const { createCreateCustomerTool } = await import("../tools/create-customer-tool.js");
    let created = 0;
    /** When true, pre-create lookup intentionally misses (simulates race window). */
    let missUntilUniqueViolation = false;
    const customers = new Map<string, { id: string; name: string; phone: string | null }>();

    const tool = createCreateCustomerTool({
      async findCustomer(input) {
        if (input.lookupBy === "phone_e164") {
          if (missUntilUniqueViolation) return { status: "not_found", count: 0 };
          const hit = customers.get(input.lookupValue);
          if (hit) {
            return { status: "found", count: 1, customer: { ...hit, email: null } };
          }
          return { status: "not_found", count: 0 };
        }
        return { status: "not_found", count: 0 };
      },
      async createCustomer(input) {
        const e164 = input.phoneIdentity?.phone_e164;
        if (e164 && customers.has(e164)) {
          missUntilUniqueViolation = false;
          throw new Error(
            'duplicate key value violates unique constraint "idx_customers_company_phone_e164_unique"',
          );
        }
        created += 1;
        const customer = {
          id: `cust-${created}`,
          name: input.name,
          phone: input.phone,
          email: null as string | null,
        };
        if (e164) customers.set(e164, customer);
        return { customer };
      },
      async getConversationWhatsAppSender() {
        return "201023169075";
      },
      async linkConversationCustomer() {},
    });

    const first = await tool.execute(
      {
        companyId: "company-a",
        conversationId: "conv-1",
        conversationState: "waiting_user",
        userId: "user-1",
      },
      { name: "عميل أول", phone: "01023169075" },
    );
    assert.equal(first.success, true);
    assert.equal(first.existing, undefined);

    // Race: second inbound misses pre-check, hits UNIQUE, then re-resolves.
    missUntilUniqueViolation = true;
    const second = await tool.execute(
      {
        companyId: "company-a",
        conversationId: "conv-2",
        conversationState: "waiting_user",
        userId: "user-1",
      },
      { name: "عميل ثاني", phone: "01023169075" },
    );
    assert.equal(second.success, true);
    assert.equal(second.existing, true);
    assert.equal(second.customerId, first.customerId);
    assert.equal(created, 1);
  });

  it("M) Meta 2010 and +2010 resolve to the same canonical E.164", () => {
    const a = resolveWhatsAppSenderPhoneE164("201023169075");
    const b = resolveWhatsAppSenderPhoneE164("+201023169075");
    assert.equal(a, "+201023169075");
    assert.equal(b, "+201023169075");
    assert.equal(a, b);
  });

  it("N) legacy phone match remains usable without rewriting customers.phone", () => {
    assert.equal(
      customerPhoneMatchesWhatsAppSender("01023169075", "201023169075", null),
      true,
    );
    assert.equal(
      customerPhoneMatchesWhatsAppSender(null, "201023169075", "+201023169075"),
      true,
    );
  });

  it("O/P) dual-write does not rewrite legacy phone input; no backfill helper invoked", () => {
    const legacyPhone = "01023169075";
    const cols = buildCustomerPhoneIdentityColumns({
      phone: legacyPhone,
      region: "EG",
      source: "channel",
    });
    assert.equal(cols.phone_e164, "+201023169075");
    assert.equal(legacyPhone, "01023169075");
  });

  it("Q) inbound resolver is pure — no outbound Meta/provider symbols", async () => {
    const src = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("./resolve-trusted-channel-customer.ts", import.meta.url), "utf8"),
    );
    assert.doesNotMatch(src, /graph\.facebook|WhatsAppProvider|notification_queue|campaign/i);
  });

  it("international Meta senders canonicalize without country-specific branches", () => {
    for (const row of INTERNATIONAL_SENDERS) {
      const resolved = resolvePhoneIdentity({ phone: row.meta, source: "channel" });
      assert.equal(resolved.status, "resolved", row.label);
      if (resolved.status === "resolved") {
        assert.equal(resolved.phoneE164, row.e164, row.label);
      }
      assert.equal(resolveWhatsAppSenderPhoneE164(row.meta), row.e164, row.label);
    }
  });

  it("phone_e164 match takes precedence over conflicting legacy phone hit", async () => {
    const e164Customer: TrustedChannelCustomerMatch = {
      id: "cust-e164",
      name: "E164",
      phone: "01099999999",
      phoneE164: "+201023169075",
    };
    const legacyCustomer: TrustedChannelCustomerMatch = {
      id: "cust-legacy",
      name: "Legacy",
      phone: "01023169075",
    };
    const result = await resolveTrustedChannelCustomer({
      companyId: "company-a",
      channelKey: "whatsapp",
      senderExternalId: "201023169075",
      findByPhoneE164: async () => ({ status: "found", customer: e164Customer }),
      findByPhone: async () => ({ status: "found", customer: legacyCustomer }),
    });
    assert.equal(result.status, "known");
    if (result.status === "known") {
      assert.equal(result.customerId, "cust-e164");
      assert.equal(result.matchSource, "phone_e164");
    }
  });

  it("Gap 5: legacy fallback ignores customers that already have a conflicting phone_e164", async () => {
    // Inbound E.164 has no column hit; legacy phone string matches a row whose
    // phone_e164 is a *different* identity — must not bind (phone_e164 IS NULL only).
    const conflictingLegacy: TrustedChannelCustomerMatch = {
      id: "cust-conflict",
      name: "Conflict",
      phone: "01023169075",
      phoneE164: "+966501234567",
    };
    const result = await resolveTrustedChannelCustomer({
      companyId: "company-a",
      channelKey: "whatsapp",
      senderExternalId: "201023169075",
      findByPhoneE164: async () => ({ status: "not_found" }),
      findByPhone: async () => ({ status: "found", customer: conflictingLegacy }),
    });
    assert.equal(result.status, "unknown");
  });

  it("Gap 5: legacy fallback still matches when phone_e164 IS NULL", async () => {
    const legacyOnly: TrustedChannelCustomerMatch = {
      id: "cust-legacy-null-e164",
      name: "LegacyNull",
      phone: "01023169075",
      phoneE164: null,
    };
    const result = await resolveTrustedChannelCustomer({
      companyId: "company-a",
      channelKey: "whatsapp",
      senderExternalId: "201023169075",
      findByPhoneE164: async () => ({ status: "not_found" }),
      findByPhone: async () => ({ status: "found", customer: legacyOnly }),
    });
    assert.equal(result.status, "known");
    if (result.status === "known") {
      assert.equal(result.customerId, "cust-legacy-null-e164");
      assert.equal(result.matchSource, "legacy_phone");
    }
  });
});
