/**
 * WhatsApp recipient resolution — D5.1 canonical e164 precedence.
 * Mocks only — no Meta, no queue writes, no customer UPDATEs, no campaigns.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  prepareWhatsAppRecipientPhoneInput,
  resolveRecipientPhone,
} from "./whatsapp-recipient-resolver.ts";
import { validateRecipientPhone } from "./whatsapp-phone-validator.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

function mockClient(options?: {
  customer?: { phone?: string | null; phone_e164?: string | null; company_id?: string } | null;
  customerPhone?: string | null;
  updates?: Array<Record<string, unknown>>;
}) {
  const updates = options?.updates ?? [];
  const customer =
    options?.customer !== undefined
      ? options.customer
      : options?.customerPhone === undefined
        ? null
        : { phone: options.customerPhone, phone_e164: null };

  return {
    from: (table: string) => {
      if (table === "customers") {
        const api = {
          select: () => api,
          eq: () => api,
          maybeSingle: async () => ({
            data: customer,
            error: null,
          }),
          update: (patch: Record<string, unknown>) => {
            updates.push(patch);
            throw new Error("customer UPDATE forbidden in recipient resolver tests");
          },
        };
        return api;
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

describe("prepareWhatsAppRecipientPhoneInput (Egypt compat helper only)", () => {
  it("Egyptian local 010… → +2010… via explicit Egypt helper", () => {
    assert.equal(prepareWhatsAppRecipientPhoneInput("01023169075"), "+201023169075");
  });

  it("international E.164 preserved", () => {
    assert.equal(prepareWhatsAppRecipientPhoneInput("+14155552671"), "+14155552671");
    const validation = validateRecipientPhone("+14155552671");
    assert.equal(validation.valid, true);
  });
});

describe("validateRecipientPhone — no blind + on locals", () => {
  it("requires leading +", () => {
    assert.equal(validateRecipientPhone("01023169075").valid, false);
    assert.equal(validateRecipientPhone("201023169075").valid, false);
    assert.equal(validateRecipientPhone("+201023169075").valid, true);
  });
});

describe("resolveRecipientPhone D5.1", () => {
  it("CRM phone_e164 preferred", async () => {
    const result = await resolveRecipientPhone(
      mockClient({
        customer: { phone: "01023169075", phone_e164: "+447123456789" },
      }) as never,
      { customerId: "cust-1", companyId: "co-a" },
    );
    assert.equal(result.phone, "+447123456789");
    assert.equal(result.phoneSource, "phone_e164");
  });

  it("CRM e164 wins over params.phone local (never Egypt-guess override)", async () => {
    const result = await resolveRecipientPhone(
      mockClient({
        customer: { phone: "x", phone_e164: "+966551234567", company_id: "co-a" },
      }) as never,
      { customerId: "cust-1", companyId: "co-a", phone: "01023169075" },
    );
    assert.equal(result.phone, "+966551234567");
  });

  it("params.phone local without region fails closed", async () => {
    const result = await resolveRecipientPhone(mockClient() as never, {
      phone: "01023169075",
    });
    assert.equal(result.phone, null);
    assert.equal(result.validation.error, "phone_identity_unresolved");
  });

  it("params international digits accepted", async () => {
    const a = await resolveRecipientPhone(mockClient() as never, { phone: "201023169075" });
    const b = await resolveRecipientPhone(mockClient() as never, { phone: "+201023169075" });
    assert.equal(a.phone, "+201023169075");
    assert.equal(b.phone, "+201023169075");
  });

  it("legacy CRM local without e164 fails closed even when params.phone is present", async () => {
    const result = await resolveRecipientPhone(
      mockClient({
        customer: { phone: "01023169075", phone_e164: null, company_id: "co-a" },
      }) as never,
      { customerId: "cust-1", companyId: "co-a", phone: "201099988877" },
    );
    // Gap 3: CRM legacy present but unresolved → fail closed; params.phone must not override.
    assert.equal(result.phone, null);
    assert.equal(result.phoneSource, "legacy_phone");
  });

  it("params.phoneE164 may still apply when CRM has no e164 (explicit e164 param)", async () => {
    const result = await resolveRecipientPhone(
      mockClient({
        customer: { phone: "01023169075", phone_e164: null, company_id: "co-a" },
      }) as never,
      { customerId: "cust-1", companyId: "co-a", phoneE164: "+201099988877" },
    );
    assert.equal(result.phone, "+201099988877");
    assert.equal(result.phoneSource, "explicit_e164");
  });

  it("CRM phone_e164 always beats params.phone", async () => {
    const result = await resolveRecipientPhone(
      mockClient({
        customer: { phone: "010", phone_e164: "+966551234567", company_id: "co-a" },
      }) as never,
      { customerId: "cust-1", companyId: "co-a", phone: "+201023169075" },
    );
    assert.equal(result.phone, "+966551234567");
    assert.equal(result.phoneSource, "phone_e164");
  });

  it("CRM legacy E.164-in-phone beats params.phone", async () => {
    const result = await resolveRecipientPhone(
      mockClient({
        customer: { phone: "+971501234567", phone_e164: null, company_id: "co-a" },
      }) as never,
      { customerId: "cust-1", companyId: "co-a", phone: "+201023169075" },
    );
    assert.equal(result.phone, "+971501234567");
    assert.equal(result.phoneSource, "legacy_phone");
  });

  it("source contract: no Meta/campaign writes; canonical path uses resolvePhoneIdentity", () => {
    const outbound = readFileSync(join(__dirname, "whatsapp-outbound-phone.ts"), "utf8");
    assert.match(outbound, /resolvePhoneIdentity/);
    assert.ok(!outbound.includes("graph.facebook.com"));
    const resolver = readFileSync(join(__dirname, "whatsapp-recipient-resolver.ts"), "utf8");
    assert.ok(!resolver.includes("graph.facebook.com"));
    assert.ok(!resolver.includes("marketing_campaigns"));
  });
});
