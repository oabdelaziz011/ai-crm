import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildInboundCustomerCreateDraft,
  resolveOrCreateCustomerFromInbound,
} from "./resolve-or-create-inbound-customer.js";
import type { TrustedChannelCustomerMatch } from "./resolve-trusted-channel-customer.js";

describe("buildInboundCustomerCreateDraft", () => {
  it("builds WhatsApp draft with channel phone identity and source", () => {
    const draft = buildInboundCustomerCreateDraft({
      channelKey: "whatsapp",
      senderExternalId: "201011404109",
      senderDisplayName: "Amr",
    });
    assert.ok(draft);
    assert.equal(draft!.source, "whatsapp");
    assert.equal(draft!.name, "Amr");
    assert.equal(draft!.phoneIdentity?.phone_e164, "+201011404109");
    assert.equal(draft!.email, null);
  });

  it("builds email draft with normalized email and local-part fallback name", () => {
    const draft = buildInboundCustomerCreateDraft({
      channelKey: "email",
      senderExternalId: "  Amr.Test@Example.COM ",
    });
    assert.ok(draft);
    assert.equal(draft!.source, "email");
    assert.equal(draft!.email, "amr.test@example.com");
    assert.equal(draft!.name, "amr.test");
  });

  it("builds SMS draft from E.164 sender", () => {
    const draft = buildInboundCustomerCreateDraft({
      channelKey: "sms",
      senderExternalId: "+14155552671",
    });
    assert.ok(draft);
    assert.equal(draft!.source, "sms");
    assert.equal(draft!.phone, "+14155552671");
    assert.equal(draft!.phoneIdentity?.phone_e164, "+14155552671");
  });

  it("builds Messenger draft with PSID channel identity and source", () => {
    const draft = buildInboundCustomerCreateDraft({
      channelKey: "messenger",
      senderExternalId: "1234567890123456",
      senderDisplayName: "Meta User",
    });
    assert.ok(draft);
    assert.equal(draft!.source, "messenger");
    assert.equal(draft!.name, "Meta User");
    assert.equal(draft!.phone, null);
    assert.equal(draft!.email, null);
    assert.deepEqual(draft!.channelIdentity, {
      channelKey: "messenger",
      externalId: "1234567890123456",
    });
  });

  it("builds Instagram draft with IGSID channel identity and source", () => {
    const draft = buildInboundCustomerCreateDraft({
      channelKey: "instagram",
      senderExternalId: "9876543210987654",
    });
    assert.ok(draft);
    assert.equal(draft!.source, "instagram");
    assert.equal(draft!.channelIdentity?.externalId, "9876543210987654");
    assert.match(draft!.name, /^Instagram /);
  });

  it("returns null for web_chat anonymous sessions (no permanent CRM identity)", () => {
    assert.equal(
      buildInboundCustomerCreateDraft({
        channelKey: "web_chat",
        senderExternalId: "anon-session-1",
      }),
      null,
    );
  });
});

describe("resolveOrCreateCustomerFromInbound", () => {
  it("reuses existing WhatsApp customer and does not create", async () => {
    const crm: TrustedChannelCustomerMatch = {
      id: "c-existing",
      name: "Existing",
      phone: "01011404109",
      phoneE164: "+201011404109",
    };
    let creates = 0;
    const result = await resolveOrCreateCustomerFromInbound({
      companyId: "company-a",
      channelKey: "whatsapp",
      senderExternalId: "201011404109",
      findByPhone: async () => ({ status: "not_found" }),
      findByPhoneE164: async () => ({ status: "found", customer: crm }),
      createCustomer: async () => {
        creates += 1;
        return { id: "should-not", name: "Nope" };
      },
    });
    assert.equal(result.status, "known");
    if (result.status === "known") {
      assert.equal(result.customerId, "c-existing");
      assert.equal(result.created, false);
    }
    assert.equal(creates, 0);
  });

  it("creates WhatsApp customer when unknown and stamps source", async () => {
    let createdSource: string | null = null;
    const result = await resolveOrCreateCustomerFromInbound({
      companyId: "company-a",
      channelKey: "whatsapp",
      senderExternalId: "201099988877",
      senderDisplayName: "Nova",
      findByPhone: async () => ({ status: "not_found" }),
      findByPhoneE164: async () => ({ status: "not_found" }),
      createCustomer: async (draft) => {
        createdSource = draft.source;
        assert.equal(draft.name, "Nova");
        assert.equal(draft.source, "whatsapp");
        return { id: "c-new", name: draft.name };
      },
    });
    assert.equal(result.status, "known");
    if (result.status === "known") {
      assert.equal(result.customerId, "c-new");
      assert.equal(result.created, true);
      assert.equal(result.trustedCustomerName, "Nova");
    }
    assert.equal(createdSource, "whatsapp");
  });

  it("creates email customer with lowercase email identity", async () => {
    const result = await resolveOrCreateCustomerFromInbound({
      companyId: "company-a",
      channelKey: "email",
      senderExternalId: "Person@Example.COM",
      senderDisplayName: "Person",
      findByPhone: async () => ({ status: "not_found" }),
      findByEmail: async (email) => {
        assert.equal(email, "person@example.com");
        return { status: "not_found" };
      },
      createCustomer: async (draft) => {
        assert.equal(draft.email, "person@example.com");
        assert.equal(draft.source, "email");
        return { id: "c-email", name: draft.name };
      },
    });
    assert.equal(result.status, "known");
    if (result.status === "known") {
      assert.equal(result.created, true);
      assert.equal(result.customerId, "c-email");
    }
  });

  it("creates SMS customer when unknown", async () => {
    const result = await resolveOrCreateCustomerFromInbound({
      companyId: "company-a",
      channelKey: "sms",
      senderExternalId: "+14155552671",
      findByPhone: async () => ({ status: "not_found" }),
      findByPhoneE164: async () => ({ status: "not_found" }),
      createCustomer: async (draft) => {
        assert.equal(draft.source, "sms");
        assert.equal(draft.phone, "+14155552671");
        return { id: "c-sms", name: draft.name };
      },
    });
    assert.equal(result.status, "known");
    if (result.status === "known") {
      assert.equal(result.created, true);
    }
  });

  it("converges on unique constraint race by re-resolving", async () => {
    const winner: TrustedChannelCustomerMatch = {
      id: "c-winner",
      name: "Winner",
      phone: "+201011404109",
      phoneE164: "+201011404109",
    };
    let attempt = 0;
    const result = await resolveOrCreateCustomerFromInbound({
      companyId: "company-a",
      channelKey: "whatsapp",
      senderExternalId: "201011404109",
      findByPhone: async () => ({ status: "not_found" }),
      findByPhoneE164: async () => {
        attempt += 1;
        if (attempt === 1) return { status: "not_found" };
        return { status: "found", customer: winner };
      },
      createCustomer: async () => {
        throw new Error(
          'duplicate key value violates unique constraint "idx_customers_company_phone_e164_unique"',
        );
      },
    });
    assert.equal(result.status, "known");
    if (result.status === "known") {
      assert.equal(result.customerId, "c-winner");
      assert.equal(result.created, false);
    }
  });

  it("does not create on ambiguous matches", async () => {
    let creates = 0;
    const result = await resolveOrCreateCustomerFromInbound({
      companyId: "company-a",
      channelKey: "email",
      senderExternalId: "dup@example.com",
      findByPhone: async () => ({ status: "not_found" }),
      findByEmail: async () => ({ status: "duplicate", count: 2 }),
      createCustomer: async () => {
        creates += 1;
        return { id: "x", name: "x" };
      },
    });
    assert.equal(result.status, "ambiguous");
    assert.equal(creates, 0);
  });

  it("keeps unknown and logs when create fails non-uniquely", async () => {
    const errors: string[] = [];
    const result = await resolveOrCreateCustomerFromInbound({
      companyId: "company-a",
      channelKey: "sms",
      senderExternalId: "+14155552672",
      findByPhone: async () => ({ status: "not_found" }),
      findByPhoneE164: async () => ({ status: "not_found" }),
      createCustomer: async () => {
        throw new Error("database offline");
      },
      onError: (detail) => errors.push(detail.code),
    });
    assert.equal(result.status, "unknown");
    assert.deepEqual(errors, ["INBOUND_CUSTOMER_CREATE_FAILED"]);
  });

  it("creates Messenger customer when unknown and stamps source", async () => {
    let createdSource: string | null = null;
    let linkedExternal: string | null = null;
    const result = await resolveOrCreateCustomerFromInbound({
      companyId: "company-a",
      channelKey: "messenger",
      senderExternalId: "1111222233334444",
      senderDisplayName: "Page Fan",
      findByPhone: async () => ({ status: "not_found" }),
      findByChannelExternalId: async ({ externalId }) => {
        assert.equal(externalId, "1111222233334444");
        return { status: "not_found" };
      },
      createCustomer: async (draft) => {
        createdSource = draft.source;
        linkedExternal = draft.channelIdentity?.externalId ?? null;
        assert.equal(draft.source, "messenger");
        assert.equal(draft.phone, null);
        return { id: "c-msg", name: draft.name };
      },
    });
    assert.equal(result.status, "known");
    if (result.status === "known") {
      assert.equal(result.created, true);
      assert.equal(result.customerId, "c-msg");
    }
    assert.equal(createdSource, "messenger");
    assert.equal(linkedExternal, "1111222233334444");
  });

  it("reuses existing Instagram customer and does not create", async () => {
    const crm = {
      id: "c-ig",
      name: "IG Fan",
      phone: null,
      phoneE164: null,
      email: null,
    };
    let creates = 0;
    const result = await resolveOrCreateCustomerFromInbound({
      companyId: "company-a",
      channelKey: "instagram",
      senderExternalId: "5555666677778888",
      findByPhone: async () => ({ status: "not_found" }),
      findByChannelExternalId: async () => ({ status: "found", customer: crm }),
      createCustomer: async () => {
        creates += 1;
        return { id: "x", name: "x" };
      },
    });
    assert.equal(result.status, "known");
    if (result.status === "known") {
      assert.equal(result.customerId, "c-ig");
      assert.equal(result.created, false);
      assert.equal(result.matchSource, "channel_external_id");
    }
    assert.equal(creates, 0);
  });

  it("Messenger unique identity race re-resolves winner", async () => {
    const winner = {
      id: "c-winner-msg",
      name: "Winner",
      phone: null,
      phoneE164: null,
      email: null,
    };
    let attempt = 0;
    const result = await resolveOrCreateCustomerFromInbound({
      companyId: "company-a",
      channelKey: "messenger",
      senderExternalId: "9999000011112222",
      findByPhone: async () => ({ status: "not_found" }),
      findByChannelExternalId: async () => {
        attempt += 1;
        if (attempt === 1) return { status: "not_found" };
        return { status: "found", customer: winner };
      },
      createCustomer: async () => {
        throw new Error(
          'duplicate key value violates unique constraint "idx_customer_channel_identities_unique"',
        );
      },
    });
    assert.equal(result.status, "known");
    if (result.status === "known") {
      assert.equal(result.customerId, "c-winner-msg");
      assert.equal(result.created, false);
    }
  });

  it("keeps web_chat unsupported (no permanent auto-create)", async () => {
    let creates = 0;
    const result = await resolveOrCreateCustomerFromInbound({
      companyId: "company-a",
      channelKey: "web_chat",
      senderExternalId: "session-uuid",
      findByPhone: async () => ({ status: "not_found" }),
      createCustomer: async () => {
        creates += 1;
        return { id: "x", name: "x" };
      },
    });
    assert.equal(result.status, "unsupported_channel");
    assert.equal(creates, 0);
  });

  it("is tenant-scoped by contract (company B lookup never sees company A)", async () => {
    const companyA: TrustedChannelCustomerMatch = {
      id: "a-only",
      name: "A",
      phone: "+201011404109",
      phoneE164: "+201011404109",
    };
    const result = await resolveOrCreateCustomerFromInbound({
      companyId: "company-b",
      channelKey: "whatsapp",
      senderExternalId: "201011404109",
      findByPhone: async () => ({ status: "not_found" }),
      findByPhoneE164: async () => ({ status: "not_found" }),
      createCustomer: async (draft) => ({ id: "b-new", name: draft.name }),
    });
    assert.equal(result.status, "known");
    if (result.status === "known") {
      assert.notEqual(result.customerId, companyA.id);
      assert.equal(result.customerId, "b-new");
    }
  });

  it("Messenger tenant isolation: company B never resolves company A PSID", async () => {
    let creates = 0;
    const result = await resolveOrCreateCustomerFromInbound({
      companyId: "company-b",
      channelKey: "messenger",
      senderExternalId: "1111222233334444",
      findByPhone: async () => ({ status: "not_found" }),
      findByChannelExternalId: async ({ externalId }) => {
        assert.equal(externalId, "1111222233334444");
        // Port must be company-scoped: company B sees not_found even if A has this PSID.
        return { status: "not_found" };
      },
      createCustomer: async (draft) => {
        creates += 1;
        assert.equal(draft.source, "messenger");
        return { id: "b-msg", name: draft.name };
      },
    });
    assert.equal(result.status, "known");
    if (result.status === "known") {
      assert.equal(result.customerId, "b-msg");
      assert.equal(result.created, true);
    }
    assert.equal(creates, 1);
  });

  it("Instagram second contact reuses same customer (no duplicate create)", async () => {
    const crm = {
      id: "c-ig-stable",
      name: "Stable IG",
      phone: null,
      phoneE164: null,
      email: null,
    };
    let creates = 0;
    const run = () =>
      resolveOrCreateCustomerFromInbound({
        companyId: "company-a",
        channelKey: "instagram",
        senderExternalId: "4444555566667777",
        findByPhone: async () => ({ status: "not_found" }),
        findByChannelExternalId: async () => ({ status: "found", customer: crm }),
        createCustomer: async () => {
          creates += 1;
          return { id: "x", name: "x" };
        },
      });
    const first = await run();
    const second = await run();
    assert.equal(first.status, "known");
    assert.equal(second.status, "known");
    if (first.status === "known" && second.status === "known") {
      assert.equal(first.customerId, second.customerId);
      assert.equal(first.created, false);
      assert.equal(second.created, false);
    }
    assert.equal(creates, 0);
  });
});
