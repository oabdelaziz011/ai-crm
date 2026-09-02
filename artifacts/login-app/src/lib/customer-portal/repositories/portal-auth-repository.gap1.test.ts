/**
 * D5.4 Gap 1 — portal upsert passes identity into RPC atomically (no second UPDATE).
 * Mocks Supabase client — no production DB writes.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PortalAuthRepository } from "./portal-auth-repository.ts";

describe("D5.4 Gap 1 portal upsert atomic identity", () => {
  it("passes phone + identity columns in a single portal_upsert_customer RPC", async () => {
    const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
    const updates: unknown[] = [];
    const client = {
      rpc: async (fn: string, args: Record<string, unknown>) => {
        rpcCalls.push({ fn, args });
        if (fn === "portal_upsert_customer") {
          return { data: "cust-new-1", error: null };
        }
        throw new Error(`unexpected rpc ${fn}`);
      },
      from: () => {
        throw new Error("customers.from must not be used for identity dual-write after Gap 1");
      },
    };

    const repo = new PortalAuthRepository(client as never);
    const id = await repo.upsertCustomer("co-a", {
      name: "Portal User",
      phone: "+201023169075",
      email: null,
    });

    assert.equal(id, "cust-new-1");
    assert.equal(rpcCalls.length, 1);
    assert.equal(rpcCalls[0]!.fn, "portal_upsert_customer");
    assert.equal(rpcCalls[0]!.args.p_phone, "+201023169075");
    assert.equal(rpcCalls[0]!.args.p_phone_e164, "+201023169075");
    assert.equal(rpcCalls[0]!.args.p_phone_country_iso, "EG");
    assert.ok(
      rpcCalls[0]!.args.p_phone_region_source === "e164" ||
        rpcCalls[0]!.args.p_phone_region_source === "explicit",
    );
    assert.equal(updates.length, 0);
  });

  it("local without region still calls RPC with unresolved identity (no invent)", async () => {
    const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
    const client = {
      rpc: async (fn: string, args: Record<string, unknown>) => {
        rpcCalls.push({ fn, args });
        return { data: "cust-local-1", error: null };
      },
      from: () => {
        throw new Error("no post-create UPDATE");
      },
    };
    const repo = new PortalAuthRepository(client as never);
    await repo.upsertCustomer("co-a", {
      name: "Local",
      phone: "01023169075",
    });
    assert.equal(rpcCalls[0]!.args.p_phone, "01023169075");
    assert.equal(rpcCalls[0]!.args.p_phone_e164, null);
    assert.equal(rpcCalls[0]!.args.p_phone_region_source, "unresolved");
  });
});
