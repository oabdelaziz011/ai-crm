import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  WhatsAppConnectionLifecycleError,
  disconnectCompanyWhatsAppConnection,
  recordWhatsAppReconnectEvent,
  transferCompanyWhatsAppConnection,
  type WhatsAppLifecycleRpcClient,
} from "./whatsapp-connection-lifecycle.js";

const here = dirname(fileURLToPath(import.meta.url));
const migrationPath = join(here, "../../../../supabase/migrations/447_whatsapp_connection_lifecycle.sql");
const routePath = join(here, "../routes/whatsapp.ts");

function mockClient(handlers: Record<string, (args: Record<string, unknown>) => { data: unknown; error: null | { message: string; code?: string } }>): WhatsAppLifecycleRpcClient {
  return {
    async rpc(fn, args) {
      const handler = handlers[fn];
      assert.ok(handler, `unexpected rpc ${fn}`);
      return handler(args);
    },
  };
}

describe("whatsapp-connection-lifecycle", () => {
  it("disconnects successfully without exposing tokens", async () => {
    const client = mockClient({
      disconnect_company_whatsapp_connection: (args) => {
        assert.equal(args.p_company_id, "c1");
        assert.equal(args.p_confirm_text, "disconnect");
        assert.equal(args.p_confirm_phone_number_id, "1214681355059951");
        assert.equal(args.p_actor_user_id, "user-1");
        return {
          data: {
            ok: true,
            action: "disconnect",
            company_id: "c1",
            phone_number_id: "1214681355059951",
            business_account_id: "waba-1",
            event_id: "evt-1",
          },
          error: null,
        };
      },
    });

    const result = await disconnectCompanyWhatsAppConnection(
      {
        companyId: "c1",
        confirmPhoneNumberId: "1214681355059951",
        confirmText: "disconnect",
        actorUserId: "user-1",
      },
      client,
    );
    assert.equal(result.ok, true);
    assert.equal(result.action, "disconnect");
    assert.equal(result.phoneNumberId, "1214681355059951");
    assert.equal(result.eventId, "evt-1");
    assert.equal(JSON.stringify(result).includes("access_token"), false);
  });

  it("rejects unauthorized disconnect", async () => {
    const client = mockClient({
      disconnect_company_whatsapp_connection: () => ({
        data: null,
        error: { message: "forbidden", code: "42501" },
      }),
    });
    await assert.rejects(
      () =>
        disconnectCompanyWhatsAppConnection(
          { companyId: "c1", confirmText: "disconnect" },
          client,
        ),
      (err: unknown) =>
        err instanceof WhatsAppConnectionLifecycleError && err.code === "forbidden" && err.statusCode === 403,
    );
  });

  it("rejects transfer without authorization", async () => {
    const client = mockClient({
      transfer_company_whatsapp_connection: () => ({
        data: null,
        error: { message: "forbidden" },
      }),
    });
    await assert.rejects(
      () =>
        transferCompanyWhatsAppConnection(
          {
            fromCompanyId: "demo",
            toCompanyId: "prod",
            confirmPhoneNumberId: "1214",
            confirmText: "transfer",
          },
          client,
        ),
      (err: unknown) =>
        err instanceof WhatsAppConnectionLifecycleError && err.code === "forbidden",
    );
  });

  it("rejects transfer when phone already bound elsewhere", async () => {
    const client = mockClient({
      transfer_company_whatsapp_connection: () => ({
        data: null,
        error: { message: "phone_in_use", code: "23505" },
      }),
    });
    await assert.rejects(
      () =>
        transferCompanyWhatsAppConnection(
          {
            fromCompanyId: "demo",
            toCompanyId: "prod",
            confirmPhoneNumberId: "1214",
            confirmText: "transfer",
          },
          client,
        ),
      (err: unknown) =>
        err instanceof WhatsAppConnectionLifecycleError && err.code === "phone_in_use" && err.statusCode === 409,
    );
  });

  it("rejects transfer of missing phone binding", async () => {
    const client = mockClient({
      transfer_company_whatsapp_connection: () => ({
        data: null,
        error: { message: "no_phone_binding", code: "P0002" },
      }),
    });
    await assert.rejects(
      () =>
        transferCompanyWhatsAppConnection(
          {
            fromCompanyId: "demo",
            toCompanyId: "prod",
            confirmPhoneNumberId: "1214",
            confirmText: "transfer",
          },
          client,
        ),
      (err: unknown) =>
        err instanceof WhatsAppConnectionLifecycleError && err.code === "no_phone_binding",
    );
  });

  it("rejects same-company transfer before RPC", async () => {
    const client = mockClient({});
    await assert.rejects(
      () =>
        transferCompanyWhatsAppConnection(
          {
            fromCompanyId: "c1",
            toCompanyId: "c1",
            confirmPhoneNumberId: "1214",
            confirmText: "transfer",
          },
          client,
        ),
      (err: unknown) =>
        err instanceof WhatsAppConnectionLifecycleError && err.code === "same_company",
    );
  });

  it("transfers successfully and never returns token fields", async () => {
    const client = mockClient({
      transfer_company_whatsapp_connection: (args) => {
        assert.equal(args.p_from_company_id, "demo");
        assert.equal(args.p_to_company_id, "prod");
        assert.equal(args.p_confirm_phone_number_id, "1214681355059951");
        assert.equal(args.p_confirm_text, "transfer");
        assert.equal(args.p_actor_user_id, "admin-1");
        return {
          data: {
            ok: true,
            action: "transfer",
            from_company_id: "demo",
            to_company_id: "prod",
            phone_number_id: "1214681355059951",
            business_account_id: "waba",
            event_id: "evt-2",
          },
          error: null,
        };
      },
    });
    const result = await transferCompanyWhatsAppConnection(
      {
        fromCompanyId: "demo",
        toCompanyId: "prod",
        confirmPhoneNumberId: "1214681355059951",
        confirmText: "transfer",
        actorUserId: "admin-1",
      },
      client,
    );
    assert.equal(result.action, "transfer");
    assert.equal(result.fromCompanyId, "demo");
    assert.equal(result.toCompanyId, "prod");
    assert.doesNotMatch(JSON.stringify(result), /token|secret|encrypted/i);
  });

  it("maps confirmation_required errors", async () => {
    const client = mockClient({
      disconnect_company_whatsapp_connection: () => ({
        data: null,
        error: { message: "confirmation_required" },
      }),
    });
    await assert.rejects(
      () => disconnectCompanyWhatsAppConnection({ companyId: "c1", confirmText: "nope" }, client),
      (err: unknown) =>
        err instanceof WhatsAppConnectionLifecycleError && err.code === "confirmation_required",
    );
  });

  it("maps target_has_active_connection for dual-bind prevention", async () => {
    const client = mockClient({
      transfer_company_whatsapp_connection: () => ({
        data: null,
        error: { message: "target_has_active_connection" },
      }),
    });
    await assert.rejects(
      () =>
        transferCompanyWhatsAppConnection(
          {
            fromCompanyId: "demo",
            toCompanyId: "prod",
            confirmPhoneNumberId: "1214",
            confirmText: "transfer",
          },
          client,
        ),
      (err: unknown) =>
        err instanceof WhatsAppConnectionLifecycleError &&
        err.code === "target_has_active_connection" &&
        err.statusCode === 409,
    );
  });
});

describe("whatsapp-connection-lifecycle SQL + route contracts", () => {
  const sql = readFileSync(migrationPath, "utf8");
  const route = readFileSync(routePath, "utf8");

  it("migration clears source before target upsert (unique phone + rollback)", () => {
    const clearIdx = sql.indexOf("Clear source first so unique(phone_number_id)");
    const upsertIdx = sql.indexOf("Upsert target with snapped encrypted material");
    assert.ok(clearIdx > 0 && upsertIdx > clearIdx);
    assert.match(sql, /meta_graph_calls', 'none'/);
    // Executable SQL must not call Meta Graph; comments may mention banned verbs.
    assert.doesNotMatch(sql, /graph\.facebook\.com|https?:\/\/|subscribed_apps/);
    assert.doesNotMatch(sql, /perform\s+.*deregister|http_request|net\.http/i);
  });

  it("migration writes audit events for disconnect and transfer", () => {
    assert.match(sql, /whatsapp_connection_lifecycle_events/);
    assert.match(sql, /'disconnect', 'succeeded'/);
    assert.match(sql, /'transfer', 'succeeded'/);
    assert.match(sql, /p_actor_user_id/);
  });

  it("migration enforces unique non-empty phone_number_id", () => {
    assert.match(sql, /company_whatsapp_settings_phone_number_id_uidx/);
  });

  it("route requires super admin for transfer and never logs tokens", () => {
    assert.match(route, /Only a super admin can transfer WhatsApp between companies/);
    assert.match(route, /actorUserId: req\.supabaseUser\?\.id/);
    assert.doesNotMatch(route, /access_token|accessTokenEncrypted/);
    assert.match(route, /metaGraph: "none"/);
  });

  it("route enforces settings.edit for disconnect (service-role RPC bypass)", () => {
    assert.match(route, /requireRequestCompanyPermission/);
    assert.match(route, /settings\.edit/);
    assert.match(route, /\/whatsapp\/disconnect/);
  });

  it("SQL transfer helper is Super Admin or service_role only", () => {
    assert.match(sql, /whatsapp_lifecycle_can_transfer/);
    assert.match(sql, /public\.is_super_admin\(\)/);
    assert.match(sql, /auth\.role\(\) = 'service_role'/);
    assert.doesNotMatch(
      sql,
      /whatsapp_lifecycle_can_transfer[\s\S]*whatsapp_settings_can_manage\(p_from_company_id\)[\s\S]*whatsapp_settings_can_manage\(p_to_company_id\)/,
    );
  });

  it("reconnect remains available via existing manual/ES paths (no Meta delete)", () => {
    assert.match(sql, /reconnect_manual|reconnect_embedded_signup/);
    assert.match(sql, /record_whatsapp_connection_lifecycle_event/);
    assert.match(route, /\/whatsapp\/disconnect/);
    assert.match(route, /\/whatsapp\/transfer/);
  });
});

describe("recordWhatsAppReconnectEvent", () => {
  it("records embedded signup reconnect without returning secrets", async () => {
    const client = mockClient({
      record_whatsapp_connection_lifecycle_event: (args) => {
        assert.equal(args.p_action, "reconnect_embedded_signup");
        assert.equal(args.p_company_id, "c1");
        assert.ok(!("access_token" in args));
        return { data: "evt-1", error: null };
      },
    });
    const result = await recordWhatsAppReconnectEvent(
      {
        companyId: "c1",
        source: "embedded_signup",
        phoneNumberId: "pn",
        businessAccountId: "waba",
      },
      client,
    );
    assert.equal(result.eventId, "evt-1");
  });
});
