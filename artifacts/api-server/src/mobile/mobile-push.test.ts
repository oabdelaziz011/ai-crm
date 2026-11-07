import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  applyPushRegistration,
  decidePushDelivery,
  decidePushRegistration,
  isPushStorageMissingError,
  pushStorageBlockedResponse,
  revokePushRegistrations,
  type PushDeviceRow,
} from "./mobile-push.js";

const companyId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const otherCompanyId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const token = "ExponentPushToken[abc123]";

describe("mobile push registration", () => {
  it("rejects a missing token, another company, and a platform session", () => {
    const invalid = decidePushRegistration({ token: "nope" }, companyId);
    assert.equal(invalid.ok, false);
    if (!invalid.ok) assert.equal(invalid.code, "invalid_push_token");
    const foreign = decidePushRegistration({ token, companyId: otherCompanyId }, companyId);
    assert.equal(foreign.ok, false);
    if (!foreign.ok) {
      assert.equal(foreign.status, 403);
      assert.equal(foreign.code, "cross_tenant");
      assert.equal(foreign.message.includes(otherCompanyId), false);
    }
    const platform = decidePushRegistration({ token }, null);
    assert.equal(platform.ok, false);
    if (!platform.ok) assert.equal(platform.code, "tenant_required");
  });

  it("keeps one active registration and revokes it without sending", () => {
    const first = applyPushRegistration([], {
      id: "1",
      userId: "user-a",
      companyId,
      token,
      platform: "android",
      deviceName: "Pixel",
      now: "2026-11-01T00:00:00.000Z",
    });
    const second = applyPushRegistration(first.rows, {
      id: "2",
      userId: "user-a",
      companyId,
      token,
      platform: "android",
      deviceName: "Pixel",
      now: "2026-11-01T00:01:00.000Z",
    });
    const moved = applyPushRegistration(second.rows, {
      id: "3",
      userId: "user-b",
      companyId,
      token,
      platform: "ios",
      deviceName: null,
      now: "2026-11-01T00:02:00.000Z",
    });
    const active = moved.rows.filter((row) => row.token === token && row.revokedAt == null);
    assert.equal(second.duplicate, true);
    assert.equal(active.length, 1);
    assert.equal(active[0]?.userId, "user-b");
    const revoked = revokePushRegistrations(moved.rows, "user-b", companyId, "2026-11-01T00:03:00.000Z");
    assert.equal(revoked.some((row: PushDeviceRow) => row.revokedAt == null), false);
    const delivery = decidePushDelivery();
    assert.equal(delivery.status, 501);
    assert.equal(delivery.code, "delivery_unverified");
    assert.equal(delivery.delivered, false);
  });

  it("blocks an unauthorized or muted payload and still does not send an allowed one", () => {
    const payload = { resource: "ticket", id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", companyId };
    const foreign = decidePushDelivery({
      recipientUserId: "user-a",
      sessionCompanyId: companyId,
      payload: { ...payload, companyId: otherCompanyId },
    });
    assert.equal(foreign.status, 403);
    assert.equal(foreign.delivered, false);
    const muted = decidePushDelivery({
      recipientUserId: "user-a",
      sessionCompanyId: companyId,
      payload,
      preferences: [{ userId: "user-a", channel: "push", muted: true }],
    });
    assert.equal(muted.code, "notification_muted");
    assert.equal(muted.delivered, false);
    const allowed = decidePushDelivery({
      recipientUserId: "user-a",
      sessionCompanyId: companyId,
      payload,
      preferences: [{ userId: "user-a", channel: "email", muted: true }],
    });
    assert.equal(allowed.status, 501);
    assert.equal(allowed.delivered, false);
  });

  it("blocks registration and revocation when mobile_push_devices is absent", () => {
    const blocked = pushStorageBlockedResponse();
    assert.equal(blocked.status, 503);
    assert.equal(blocked.body.code, "push_storage_unavailable");
    assert.equal(blocked.body.stored, false);
    assert.equal(blocked.body.revoked, false);
    assert.equal(blocked.body.delivered, false);
    assert.equal(isPushStorageMissingError(new Error("Could not find the table 'public.mobile_push_devices' in the schema cache")), true);
    assert.equal(isPushStorageMissingError(new Error("relation \"public.mobile_push_devices\" does not exist")), true);
    assert.equal(isPushStorageMissingError({ code: "42P01", message: "undefined_table" }), true);
    assert.equal(isPushStorageMissingError(new Error("permission denied")), false);
    assert.equal(isPushStorageMissingError(new Error("permission denied for table mobile_push_devices")), false);
    const route = readFileSync(new URL("../routes/mobile-records.ts", import.meta.url), "utf8");
    assert.match(route, /isPushStorageMissingError\(/);
    assert.match(route, /savePushRegistration\(/);
    assert.match(route, /revokeStoredPushRegistrations\(/);
  });
});
