/**
 * Phase D5.1 — outbound phone_e164 preference; no Egypt-guess as global fallback.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  hasWhatsAppOutboundPhoneCandidate,
  prepareWhatsAppRecipientPhoneInput,
  resolveWhatsAppOutboundPhone,
  selectWhatsAppOutboundPhoneRaw,
} from "./whatsapp-outbound-phone.ts";
import {
  prepareWhatsAppRecipientPhoneInput as prepareFromResolver,
  resolveRecipientPhone,
} from "./whatsapp-recipient-resolver.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

function mockClient(options?: {
  customer?: { phone?: string | null; phone_e164?: string | null; company_id?: string } | null;
  updates?: Array<Record<string, unknown>>;
}) {
  const updates = options?.updates ?? [];
  return {
    from: (table: string) => {
      if (table === "customers") {
        const row = options?.customer;
        const api = {
          select: () => api,
          eq: (_col: string, _val: string) => api,
          maybeSingle: async () => ({
            data: row === undefined ? null : row,
            error: null,
          }),
          update: (patch: Record<string, unknown>) => {
            updates.push(patch);
            throw new Error("customer UPDATE forbidden in D5.1 recipient tests");
          },
        };
        return api;
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

describe("D5.1 selectWhatsAppOutboundPhoneRaw", () => {
  it("A) prefers phone_e164 over legacy phone", () => {
    const selected = selectWhatsAppOutboundPhoneRaw({
      phone: "01023169075",
      phone_e164: "+966551234567",
    });
    assert.deepEqual(selected, { raw: "+966551234567", source: "phone_e164" });
  });

  it("B) falls back to legacy phone when e164 null", () => {
    const selected = selectWhatsAppOutboundPhoneRaw({
      phone: "01023169075",
      phone_e164: null,
    });
    assert.deepEqual(selected, { raw: "01023169075", source: "legacy_phone" });
  });
});

describe("D5.1 resolveWhatsAppOutboundPhone", () => {
  it("Egypt local + explicit EG region → E.164", () => {
    const r = resolveWhatsAppOutboundPhone({
      phone: "01023169075",
      phone_e164: null,
      region: "EG",
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.phone, "+201023169075");
      assert.equal(r.source, "explicit_resolved");
    }
  });

  it("Egypt local WITHOUT region → unresolved (never Egypt-guess)", () => {
    const r = resolveWhatsAppOutboundPhone({ phone: "01023169075", phone_e164: null });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "phone_identity_unresolved");
  });

  it("international E.164 countries without hardcoding", () => {
    const samples = [
      "+201023169075",
      "+966551234567",
      "+971501234567",
      "+97433123456",
      "+96550012345",
      "+97336123456",
      "+96891234567",
      "+447123456789",
      "+14155552671",
      "+14165551234",
      "+4915123456789",
      "+33123456789",
      "+393331234567",
      "+34612345678",
      "+919876543210",
    ];
    for (const phone of samples) {
      const r = resolveWhatsAppOutboundPhone({ phone_e164: phone, phone: null });
      assert.equal(r.ok, true, phone);
      if (r.ok) assert.equal(r.phone, phone);
    }
  });

  it("US/CA E.164 accepted even when numberType is UNKNOWN", () => {
    for (const phone of ["+14155552671", "+14165551234"]) {
      const r = resolveWhatsAppOutboundPhone({ phone_e164: phone });
      assert.equal(r.ok, true, phone);
      if (r.ok) assert.equal(r.phone, phone);
    }
  });

  it("Saudi local without region fails closed", () => {
    const r = resolveWhatsAppOutboundPhone({ phone: "0551234567", phone_e164: null });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "phone_identity_unresolved");
  });

  it("UK local without region fails closed", () => {
    const r = resolveWhatsAppOutboundPhone({ phone: "07123456789", phone_e164: null });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "phone_identity_unresolved");
  });

  it("company country must never appear as region guess", () => {
    const src = readFileSync(join(__dirname, "whatsapp-outbound-phone.ts"), "utf8");
    assert.doesNotMatch(src, /companyCountry|browserLocale|slice\s*\(\s*-9\s*\)/);
    assert.match(src, /resolvePhoneIdentity/);
  });

  it("canonical phone_e164 used without Egypt prepare", () => {
    const r = resolveWhatsAppOutboundPhone({
      phone: "01023169075",
      phone_e164: "+966551234567",
    });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.phone, "+966551234567");
  });

  it("campaign candidate helper", () => {
    assert.equal(
      hasWhatsAppOutboundPhoneCandidate({ phone: null, phoneE164: "+201023169075" }),
      true,
    );
    assert.equal(hasWhatsAppOutboundPhoneCandidate({ phone: null, phone_e164: null }), false);
  });
});

describe("D5.1 resolveRecipientPhone precedence", () => {
  it("CRM phone_e164 preferred from CRM", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const result = await resolveRecipientPhone(
      mockClient({
        customer: {
          phone: "01023169075",
          phone_e164: "+971501234567",
          company_id: "co-a",
        },
        updates,
      }) as never,
      { customerId: "cust-1", companyId: "co-a" },
    );
    assert.equal(result.phone, "+971501234567");
    assert.equal(result.phoneSource, "phone_e164");
    assert.equal(updates.length, 0);
  });

  it("CRM phone_e164 wins over conflicting params.phone local", async () => {
    const result = await resolveRecipientPhone(
      mockClient({
        customer: {
          phone: "01023169075",
          phone_e164: "+966551234567",
          company_id: "co-a",
        },
      }) as never,
      {
        customerId: "cust-1",
        companyId: "co-a",
        phone: "01023169075",
      },
    );
    assert.equal(result.phone, "+966551234567");
    assert.equal(result.phoneSource, "phone_e164");
  });

  it("params.phone local without region fails closed", async () => {
    const result = await resolveRecipientPhone(mockClient() as never, {
      phone: "01023169075",
    });
    assert.equal(result.phone, null);
    assert.equal(result.validation.valid, false);
    assert.equal(result.validation.error, "phone_identity_unresolved");
  });

  it("params.phoneE164 accepted", async () => {
    const result = await resolveRecipientPhone(mockClient() as never, {
      phoneE164: "+447123456789",
    });
    assert.equal(result.phone, "+447123456789");
    assert.equal(result.phoneSource, "explicit_e164");
  });

  it("params.phone international digits resolve without Egypt helper", async () => {
    const a = await resolveRecipientPhone(mockClient() as never, { phone: "201023169075" });
    const b = await resolveRecipientPhone(mockClient() as never, { phone: "+201023169075" });
    assert.equal(a.phone, "+201023169075");
    assert.equal(b.phone, "+201023169075");
  });

  it("legacy CRM local without e164 fails closed", async () => {
    const result = await resolveRecipientPhone(
      mockClient({
        customer: { phone: "01023169075", phone_e164: null, company_id: "co-a" },
      }) as never,
      { customerId: "cust-1", companyId: "co-a" },
    );
    assert.equal(result.phone, null);
    assert.equal(result.validation.error, "phone_identity_unresolved");
  });

  it("tenant-scoped lookup uses company_id when provided", async () => {
    const src = readFileSync(join(__dirname, "whatsapp-recipient-resolver.ts"), "utf8");
    assert.match(src, /company_id/);
    assert.match(src, /phone_e164/);
    assert.match(src, /Canonical CRM phone_e164 always wins/i);
  });

  it("no DB mutation during resolution", async () => {
    const updates: Array<Record<string, unknown>> = [];
    await resolveRecipientPhone(
      mockClient({
        customer: { phone: "+201023169075", phone_e164: "+201023169075" },
        updates,
      }) as never,
      { customerId: "cust-1", companyId: "co-a" },
    );
    assert.equal(updates.length, 0);
  });

  it("Egypt prepare helper remains available but is not the generic path", () => {
    assert.equal(prepareFromResolver("01023169075"), "+201023169075");
    assert.equal(prepareWhatsAppRecipientPhoneInput("01023169075"), "+201023169075");
    const outboundSrc = readFileSync(join(__dirname, "whatsapp-outbound-phone.ts"), "utf8");
    assert.match(outboundSrc, /NOT the generic international outbound resolver/);
    assert.doesNotMatch(
      readFileSync(join(__dirname, "whatsapp-recipient-resolver.ts"), "utf8"),
      /prepareWhatsAppRecipientPhoneInput\(param/,
    );
  });
});

describe("D5.1 contracts", () => {
  it("does not rewrite external_thread_id", () => {
    const src = readFileSync(join(__dirname, "whatsapp-outbound-phone.ts"), "utf8");
    assert.doesNotMatch(src, /external_thread_id|channel_sessions/);
  });
});
