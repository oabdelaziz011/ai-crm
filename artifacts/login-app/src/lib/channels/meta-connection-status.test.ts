import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  META_CONNECTION_STATUS_LABELS,
  resolveMetaConnectionStatus,
} from "./meta-connection-status";

describe("meta-connection-status", () => {
  it("exposes the five tenant-facing labels", () => {
    assert.equal(META_CONNECTION_STATUS_LABELS.connected, "Connected");
    assert.equal(META_CONNECTION_STATUS_LABELS.not_connected, "Not Connected");
    assert.equal(META_CONNECTION_STATUS_LABELS.connection_expired, "Connection Expired");
    assert.equal(
      META_CONNECTION_STATUS_LABELS.reauthorization_required,
      "Reauthorization Required",
    );
    assert.equal(
      META_CONNECTION_STATUS_LABELS.webhook_subscription_failed,
      "Webhook Subscription Failed",
    );
  });

  it("resolves connected only when enabled + token + health ok", () => {
    assert.equal(
      resolveMetaConnectionStatus({
        enabled: true,
        hasAccessToken: true,
        healthOk: true,
      }),
      "connected",
    );
    assert.equal(
      resolveMetaConnectionStatus({
        enabled: true,
        hasAccessToken: true,
        healthOk: false,
      }),
      "reauthorization_required",
    );
    assert.equal(
      resolveMetaConnectionStatus({
        enabled: false,
        hasAccessToken: false,
      }),
      "not_connected",
    );
    assert.equal(
      resolveMetaConnectionStatus({
        enabled: true,
        hasAccessToken: true,
        tokenExpired: true,
      }),
      "connection_expired",
    );
    assert.equal(
      resolveMetaConnectionStatus({
        enabled: true,
        hasAccessToken: true,
        webhookFailed: true,
      }),
      "webhook_subscription_failed",
    );
  });

  it("does not label health-not-run manual installs as Reauthorization Required", () => {
    assert.equal(
      resolveMetaConnectionStatus({
        enabled: true,
        hasAccessToken: true,
        healthOk: null,
        stored: "not_connected",
      }),
      "connected",
    );
  });
});
