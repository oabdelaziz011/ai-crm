import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildWhatsAppSenderPhoneLookupVariants,
  customerPhoneMatchesWhatsAppSender,
  readTrustedCustomerIdFromConversation,
  resolveTrustedChannelCustomer,
  type TrustedChannelCustomerMatch,
} from "./resolve-trusted-channel-customer.js";

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
