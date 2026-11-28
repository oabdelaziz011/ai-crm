import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  assertValidTemplateStatusWebhookSignature,
  extractMetaTemplateStatusWebhookEvents,
  processSecureWhatsAppTemplateStatusWebhook,
  resolvePlatformMetaWebhookSigningSecret,
  resolveUniqueCompanyIdForWaba,
  WhatsAppTemplateWebhookAmbiguousWabaError,
  WhatsAppTemplateWebhookAuthError,
  WhatsAppTemplateWebhookProcessingError,
} from "./whatsapp-template-status-webhook";

const SAMPLE_PAYLOAD = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "waba-a",
      changes: [
        {
          field: "message_template_status_update",
          value: {
            event: "APPROVED",
            message_template_id: "tpl-9",
            message_template_name: "valueor_order_confirmed",
            message_template_language: "en_US",
          },
        },
      ],
    },
  ],
};

const MULTI_TEMPLATE_SAME_COMPANY_PAYLOAD = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "waba-a",
      changes: [
        {
          field: "message_template_status_update",
          value: {
            event: "APPROVED",
            message_template_id: "tpl-1",
            message_template_name: "valueor_order_confirmed",
            message_template_language: "en_US",
          },
        },
        {
          field: "message_template_status_update",
          value: {
            event: "REJECTED",
            message_template_id: "tpl-2",
            message_template_name: "valueor_payment_link",
            message_template_language: "en_US",
          },
        },
      ],
    },
  ],
};

const MULTI_COMPANY_PAYLOAD = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "waba-a",
      changes: [
        {
          field: "message_template_status_update",
          value: {
            event: "APPROVED",
            message_template_id: "tpl-a",
            message_template_name: "valueor_order_confirmed",
            message_template_language: "en_US",
          },
        },
      ],
    },
    {
      id: "waba-b",
      changes: [
        {
          field: "message_template_status_update",
          value: {
            event: "APPROVED",
            message_template_id: "tpl-b",
            message_template_name: "valueor_order_confirmed",
            message_template_language: "en_US",
          },
        },
      ],
    },
  ],
};

function createClient(opts: {
  wabaMap: Record<string, string[]>;
  onUpdate?: (row: Record<string, unknown>) => void;
  failUpdateOnTemplateId?: string;
  failLookup?: boolean;
}) {
  return {
    from(table: string) {
      if (table === "company_whatsapp_settings") {
        return {
          select() {
            return {
              eq(_col: string, wabaId: string) {
                if (opts.failLookup) {
                  return Promise.resolve({
                    data: null,
                    error: { message: "settings_lookup_failed" },
                  });
                }
                const ids = opts.wabaMap[wabaId] ?? [];
                return Promise.resolve({
                  data: ids.map((company_id) => ({ company_id })),
                  error: null,
                });
              },
            };
          },
        };
      }
      return {
        update(payload: Record<string, unknown>) {
          const filters: Record<string, string> = {};
          const api = {
            eq(col: string, value: string) {
              filters[col] = value;
              return api;
            },
            select() {
              if (
                opts.failUpdateOnTemplateId &&
                filters.meta_template_id === opts.failUpdateOnTemplateId
              ) {
                return Promise.resolve({
                  data: null,
                  error: { message: "simulated_db_update_failure" },
                });
              }
              opts.onUpdate?.({ ...payload, ...filters });
              return Promise.resolve({ data: [{ id: "1" }], error: null });
            },
          };
          return api;
        },
      };
    },
  };
}

const PLATFORM_ENV = {
  META_EMBEDDED_SIGNUP_APP_SECRET: "platform-secret",
} as NodeJS.ProcessEnv;

const okVerify = async () => true;

describe("whatsapp-template-status-webhook security", () => {
  it("extracts message_template_status_update events by WABA", () => {
    const events = extractMetaTemplateStatusWebhookEvents(SAMPLE_PAYLOAD);
    assert.equal(events.length, 1);
    assert.equal(events[0]?.wabaId, "waba-a");
    assert.equal(events[0]?.eventOrStatus, "APPROVED");
  });

  it("resolves platform signing secret from Meta App env (never tenant body)", () => {
    assert.equal(
      resolvePlatformMetaWebhookSigningSecret({
        META_WHATSAPP_WEBHOOK_APP_SECRET: "dedicated",
        META_EMBEDDED_SIGNUP_APP_SECRET: "embedded",
      } as NodeJS.ProcessEnv),
      "dedicated",
    );
    assert.equal(
      resolvePlatformMetaWebhookSigningSecret({
        META_EMBEDDED_SIGNUP_APP_SECRET: "embedded-only",
      } as NodeJS.ProcessEnv),
      "embedded-only",
    );
    assert.equal(resolvePlatformMetaWebhookSigningSecret({} as NodeJS.ProcessEnv), null);
  });

  it("rejects missing platform signing secret before any verify call", async () => {
    let verifyCalled = false;
    await assert.rejects(
      () =>
        assertValidTemplateStatusWebhookSignature({
          signatureHeader: "sha256=abc",
          rawBody: "{}",
          env: {} as NodeJS.ProcessEnv,
          verifyFn: async () => {
            verifyCalled = true;
            return true;
          },
        }),
      (err: unknown) =>
        err instanceof WhatsAppTemplateWebhookAuthError &&
        err.code === "signing_secret_missing" &&
        err.statusCode === 503,
    );
    assert.equal(verifyCalled, false);
  });

  it("rejects missing signature header with requireSecret semantics", async () => {
    await assert.rejects(
      () =>
        assertValidTemplateStatusWebhookSignature({
          signatureHeader: null,
          rawBody: "{}",
          env: PLATFORM_ENV,
          verifyFn: async () => true,
        }),
      (err: unknown) =>
        err instanceof WhatsAppTemplateWebhookAuthError && err.code === "signature_missing",
    );
  });

  it("rejects invalid HMAC and never marks valid", async () => {
    await assert.rejects(
      () =>
        assertValidTemplateStatusWebhookSignature({
          signatureHeader: "sha256=deadbeef",
          rawBody: "{}",
          env: PLATFORM_ENV,
          verifyFn: async (input) => {
            assert.equal(input.requireSecret, true);
            assert.equal(input.appSecret, "platform-secret");
            return false;
          },
        }),
      (err: unknown) =>
        err instanceof WhatsAppTemplateWebhookAuthError && err.code === "invalid_signature",
    );
  });

  it("passes requireSecret:true to the verifier on success path", async () => {
    let seenRequireSecret: boolean | undefined;
    await assertValidTemplateStatusWebhookSignature({
      signatureHeader: "sha256=ok",
      rawBody: '{"x":1}',
      env: PLATFORM_ENV,
      verifyFn: async (input) => {
        seenRequireSecret = input.requireSecret === true;
        assert.equal(input.rawBody, '{"x":1}');
        return true;
      },
    });
    assert.equal(seenRequireSecret, true);
  });

  it("rejects ambiguous WABA→company mapping", async () => {
    const client = createClient({
      wabaMap: { "waba-dup": ["company-a", "company-b"] },
    });
    await assert.rejects(
      () => resolveUniqueCompanyIdForWaba(client as never, "waba-dup"),
      (err: unknown) =>
        err instanceof WhatsAppTemplateWebhookAmbiguousWabaError &&
        err.statusCode === 409 &&
        err.companyIds.length === 2,
    );
  });

  it("invalid signature prevents all database updates", async () => {
    const updates: unknown[] = [];
    const client = createClient({
      wabaMap: { "waba-a": ["company-a"] },
      onUpdate: (row) => updates.push(row),
    });

    await assert.rejects(
      () =>
        processSecureWhatsAppTemplateStatusWebhook(client as never, {
          payload: SAMPLE_PAYLOAD,
          signatureHeader: "sha256=bad",
          rawBody: JSON.stringify(SAMPLE_PAYLOAD),
          env: PLATFORM_ENV,
          verifyFn: async () => false,
        }),
      (err: unknown) =>
        err instanceof WhatsAppTemplateWebhookAuthError &&
        err.code === "invalid_signature" &&
        err.statusCode === 401,
    );
    assert.equal(updates.length, 0);
  });

  it("missing signing secret returns 503 semantics with zero updates", async () => {
    const updates: unknown[] = [];
    const client = createClient({
      wabaMap: { "waba-a": ["company-a"] },
      onUpdate: (row) => updates.push(row),
    });

    await assert.rejects(
      () =>
        processSecureWhatsAppTemplateStatusWebhook(client as never, {
          payload: SAMPLE_PAYLOAD,
          signatureHeader: "sha256=ok",
          rawBody: JSON.stringify(SAMPLE_PAYLOAD),
          env: {} as NodeJS.ProcessEnv,
          verifyFn: okVerify,
        }),
      (err: unknown) =>
        err instanceof WhatsAppTemplateWebhookAuthError &&
        err.code === "signing_secret_missing" &&
        err.statusCode === 503,
    );
    assert.equal(updates.length, 0);
  });

  it("valid signature updates only the mapped company", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const client = createClient({
      wabaMap: {
        "waba-a": ["company-a"],
        "waba-b": ["company-b"],
      },
      onUpdate: (row) => updates.push(row),
    });

    const result = await processSecureWhatsAppTemplateStatusWebhook(client as never, {
      payload: SAMPLE_PAYLOAD,
      signatureHeader: "sha256=ok",
      rawBody: JSON.stringify(SAMPLE_PAYLOAD),
      env: PLATFORM_ENV,
      verifyFn: async (input) => {
        assert.equal(input.requireSecret, true);
        return true;
      },
    });

    assert.equal(result.handled, true);
    assert.deepEqual(result.companyIds, ["company-a"]);
    assert.ok(updates.every((u) => u.company_id === "company-a"));
    assert.equal(
      updates.some((u) => u.company_id === "company-b"),
      false,
    );
  });

  it("ambiguous WABA aborts before updates", async () => {
    const updates: unknown[] = [];
    const client = createClient({
      wabaMap: { "waba-a": ["company-a", "company-b"] },
      onUpdate: (row) => updates.push(row),
    });

    await assert.rejects(
      () =>
        processSecureWhatsAppTemplateStatusWebhook(client as never, {
          payload: SAMPLE_PAYLOAD,
          signatureHeader: "sha256=ok",
          rawBody: JSON.stringify(SAMPLE_PAYLOAD),
          env: PLATFORM_ENV,
          verifyFn: okVerify,
        }),
      (err: unknown) =>
        err instanceof WhatsAppTemplateWebhookAmbiguousWabaError && err.statusCode === 409,
    );
    assert.equal(updates.length, 0);
  });

  it("database failure returns processing error (500) and stops remaining writes", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const client = createClient({
      wabaMap: {
        "waba-a": ["company-a"],
        "waba-b": ["company-b"],
      },
      failUpdateOnTemplateId: "tpl-b",
      onUpdate: (row) => updates.push(row),
    });

    await assert.rejects(
      () =>
        processSecureWhatsAppTemplateStatusWebhook(client as never, {
          payload: MULTI_COMPANY_PAYLOAD,
          signatureHeader: "sha256=ok",
          rawBody: JSON.stringify(MULTI_COMPANY_PAYLOAD),
          env: PLATFORM_ENV,
          verifyFn: okVerify,
        }),
      (err: unknown) =>
        err instanceof WhatsAppTemplateWebhookProcessingError &&
        err.statusCode === 500 &&
        err.code === "template_status_processing_failed",
    );

    // First company may have been updated; second must not run after failure.
    assert.equal(updates.length, 1);
    assert.equal(updates[0]?.company_id, "company-a");
    assert.equal(
      updates.some((u) => u.company_id === "company-b"),
      false,
    );
  });

  it("WABA lookup database failure occurs before any template updates", async () => {
    const updates: unknown[] = [];
    const client = createClient({
      wabaMap: { "waba-a": ["company-a"] },
      failLookup: true,
      onUpdate: (row) => updates.push(row),
    });

    await assert.rejects(
      () =>
        processSecureWhatsAppTemplateStatusWebhook(client as never, {
          payload: SAMPLE_PAYLOAD,
          signatureHeader: "sha256=ok",
          rawBody: JSON.stringify(SAMPLE_PAYLOAD),
          env: PLATFORM_ENV,
          verifyFn: okVerify,
        }),
      (err: unknown) =>
        err instanceof WhatsAppTemplateWebhookProcessingError && err.statusCode === 500,
    );
    assert.equal(updates.length, 0);
  });

  it("multiple template updates for one company all apply under that company_id", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const client = createClient({
      wabaMap: { "waba-a": ["company-a"] },
      onUpdate: (row) => updates.push(row),
    });

    const result = await processSecureWhatsAppTemplateStatusWebhook(client as never, {
      payload: MULTI_TEMPLATE_SAME_COMPANY_PAYLOAD,
      signatureHeader: "sha256=ok",
      rawBody: JSON.stringify(MULTI_TEMPLATE_SAME_COMPANY_PAYLOAD),
      env: PLATFORM_ENV,
      verifyFn: okVerify,
    });

    assert.equal(result.handled, true);
    assert.equal(result.events, 2);
    assert.equal(result.updated, 2);
    assert.deepEqual(result.companyIds, ["company-a"]);
    assert.equal(updates.length, 2);
    assert.ok(updates.every((u) => u.company_id === "company-a"));
    assert.deepEqual(
      updates.map((u) => u.meta_template_id).sort(),
      ["tpl-1", "tpl-2"],
    );
  });

  it("duplicate valid events are idempotent updates (no harmful repeated effects)", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const client = createClient({
      wabaMap: { "waba-a": ["company-a"] },
      onUpdate: (row) => updates.push(row),
    });

    const input = {
      payload: SAMPLE_PAYLOAD,
      signatureHeader: "sha256=ok",
      rawBody: JSON.stringify(SAMPLE_PAYLOAD),
      env: PLATFORM_ENV,
      verifyFn: okVerify,
    };

    const first = await processSecureWhatsAppTemplateStatusWebhook(client as never, input);
    const second = await processSecureWhatsAppTemplateStatusWebhook(client as never, input);

    assert.equal(first.handled, true);
    assert.equal(second.handled, true);
    assert.equal(first.updated, 1);
    assert.equal(second.updated, 1);
    assert.equal(updates.length, 2);
    assert.ok(updates.every((u) => u.company_id === "company-a"));
    assert.ok(updates.every((u) => u.meta_status === "APPROVED"));
    assert.ok(updates.every((u) => u.meta_template_id === "tpl-9"));
    // Update path only — never inserts / never touches other companies.
    assert.equal(
      updates.some((u) => u.company_id === "company-b"),
      false,
    );
  });

  it("deprecated unauthenticated handler is not exported", () => {
    const sourcePath = join(
      dirname(fileURLToPath(import.meta.url)),
      "whatsapp-template-status-webhook.ts",
    );
    const source = readFileSync(sourcePath, "utf8");
    assert.doesNotMatch(source, /export\s+async\s+function\s+handleWhatsAppTemplateStatusWebhook/);
    assert.doesNotMatch(source, /\bhandleWhatsAppTemplateStatusWebhook\b/);
  });
});
