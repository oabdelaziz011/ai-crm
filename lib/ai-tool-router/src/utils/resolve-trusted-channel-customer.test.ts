import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildWhatsAppSenderPhoneLookupVariants,
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
    // Simulate company-B scoped findByPhone that never sees company-A rows.
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

  it("builds 2010↔010 lookup variants without a second normalizer", () => {
    const variants = buildWhatsAppSenderPhoneLookupVariants("201011404109");
    assert.ok(variants.includes("201011404109") || variants.includes("01011404109"));
    assert.ok(variants.includes("01011404109"));
  });
});
