/**
 * Local-only push storage against 127.0.0.1:54322.
 * Skips when the local database or mobile_push_devices table is absent.
 * Never uses hosted production credentials.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, describe, it } from "node:test";
import {
  decidePushDelivery,
  decidePushRegistration,
  isPushStorageMissingError,
} from "./mobile-push.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../../..");
const require = createRequire(resolve(root, "lib/db/package.json"));
const pg = require("pg") as typeof import("pg");

const databaseUrl = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const companyId = "d0000010-0001-4001-8001-000000000001";
const otherCompanyId = "d0000010-0001-4001-8001-000000000003";
const userId = "d0000002-0001-4001-8001-000000000001";
const token = "ExponentPushToken[local-integration-abc]";

function assertLoopback(url: string): void {
  const host = new URL(url).hostname;
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error("Push storage integration refuses a non-loopback database.");
  }
}

describe("mobile push storage local integration", () => {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });
  let available = false;

  before(async () => {
    assertLoopback(databaseUrl);
    try {
      const result = await pool.query("select to_regclass('public.mobile_push_devices') as table_name");
      available = Boolean(result.rows[0]?.table_name);
    } catch {
      available = false;
    }
  });

  after(async () => {
    if (available) {
      await pool.query("delete from public.mobile_push_devices where expo_push_token = $1", [token]);
    }
    await pool.end();
  });

  it("persists, deduplicates, and revokes a device token for one company", async (t) => {
    if (!available) {
      t.skip("local mobile_push_devices is not present");
      return;
    }

    const decision = decidePushRegistration(
      { token, platform: "android", deviceName: "Pixel Local" },
      companyId,
    );
    assert.equal(decision.ok, true);
    if (!decision.ok) return;

    await pool.query("delete from public.mobile_push_devices where expo_push_token = $1", [token]);

    const firstInsert = await pool.query(
      `insert into public.mobile_push_devices
        (user_id, company_id, expo_push_token, platform, device_name, revoked_at, last_seen_at, updated_at)
       values ($1::uuid, $2::uuid, $3, $4, $5, null, now(), now())
       returning id`,
      [userId, companyId, decision.token, decision.platform, decision.deviceName],
    );
    assert.equal(firstInsert.rowCount, 1);

    const refresh = await pool.query(
      `update public.mobile_push_devices
          set revoked_at = null,
              platform = $4,
              device_name = $5,
              last_seen_at = now(),
              updated_at = now()
        where user_id = $1::uuid
          and company_id = $2::uuid
          and expo_push_token = $3
      returning id`,
      [userId, companyId, decision.token, decision.platform, decision.deviceName],
    );
    assert.equal(refresh.rowCount, 1);

    const foreign = decidePushRegistration({ token, companyId: otherCompanyId }, companyId);
    assert.equal(foreign.ok, false);
    if (!foreign.ok) assert.equal(foreign.code, "cross_tenant");

    await pool.query(
      `update public.mobile_push_devices
          set revoked_at = now(), updated_at = now()
        where user_id = $1::uuid and company_id = $2::uuid and expo_push_token = $3`,
      [userId, companyId, decision.token],
    );
    const after = await pool.query(
      `select count(*)::int as n
         from public.mobile_push_devices
        where expo_push_token = $1 and revoked_at is null`,
      [decision.token],
    );
    assert.equal(after.rows[0].n, 0);

    const delivery = decidePushDelivery({
      recipientUserId: userId,
      sessionCompanyId: companyId,
      payload: { resource: "ticket", id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", companyId },
    });
    assert.equal(delivery.delivered, false);
    assert.equal(delivery.status, 501);
    assert.equal(isPushStorageMissingError(new Error("permission denied for table mobile_push_devices")), false);
  });
});
