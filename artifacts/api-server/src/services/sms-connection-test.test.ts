import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { performSmsConnectionTest } from "./sms-connection-test.js";

describe("SMS connection test — honest provider auth", () => {
  it("fails safely when provider configuration is missing", async () => {
    const report = await performSmsConnectionTest(null);
    assert.equal(report.ok, false);
    assert.equal(report.reason, "provider_missing");
  });

  it("fails when SMS settings are disabled", async () => {
    const report = await performSmsConnectionTest({
      enabled: false,
      provider: "twilio",
      accountSid: "ACxxx",
      fromNumber: "+15551234567",
      authToken: "secret",
    });
    assert.equal(report.ok, false);
    assert.equal(report.reason, "settings_disabled");
  });

  it("fails when provider is not selected", async () => {
    const report = await performSmsConnectionTest({
      enabled: true,
      provider: "",
      accountSid: "",
      fromNumber: "",
      authToken: "",
    });
    assert.equal(report.ok, false);
    assert.equal(report.reason, "provider_missing");
  });

  it("fails when credentials are incomplete", async () => {
    const report = await performSmsConnectionTest({
      enabled: true,
      provider: "twilio",
      accountSid: "ACxxx",
      fromNumber: "",
      authToken: "secret",
    });
    assert.equal(report.ok, false);
    assert.equal(report.reason, "credentials_incomplete");
  });

  it("does not return success from a stub — requires live Twilio auth", async () => {
    const report = await performSmsConnectionTest(
      {
        enabled: true,
        provider: "twilio",
        accountSid: "ACxxx",
        fromNumber: "+15551234567",
        authToken: "secret",
      },
      async () =>
        new Response(JSON.stringify({ status: 401, message: "Authenticate" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
    );
    assert.equal(report.ok, false);
    assert.equal(report.reason, "provider_auth_failed");
  });

  it("returns ok only after provider authentication succeeds", async () => {
    const report = await performSmsConnectionTest(
      {
        enabled: true,
        provider: "twilio",
        accountSid: "ACxxx",
        fromNumber: "+15551234567",
        authToken: "secret",
      },
      async () =>
        new Response(JSON.stringify({ friendly_name: "ValueOR SMS" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    assert.equal(report.ok, true);
    assert.equal(report.reason, "ok");
    assert.equal(report.accountName, "ValueOR SMS");
    assert.equal(report.accountSid, "ACxxx");
  });

  it("never includes auth token in the report", async () => {
    const report = await performSmsConnectionTest({
      enabled: true,
      provider: "twilio",
      accountSid: "ACxxx",
      fromNumber: "+15551234567",
      authToken: "super-secret-token",
    });
    assert.equal(JSON.stringify(report).includes("super-secret-token"), false);
  });
});
