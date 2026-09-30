import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isEmailCampaignOutboundTransportReady } from "./email-capability.ts";

describe("isEmailCampaignOutboundTransportReady", () => {
  it("accepts SMTP with host + password", () => {
    assert.equal(
      isEmailCampaignOutboundTransportReady({
        fromEmail: "ops@example.com",
        smtpHost: "smtp.gmail.com",
        smtpUsername: "ops@example.com",
        hasSmtpPassword: true,
        hasOauthToken: false,
        outboundProvider: "smtp",
      }),
      true,
    );
  });

  it("rejects microsoft_graph without OAuth token", () => {
    assert.equal(
      isEmailCampaignOutboundTransportReady({
        fromEmail: "ops@example.com",
        smtpHost: "",
        smtpUsername: "",
        hasSmtpPassword: false,
        hasOauthToken: false,
        outboundProvider: "microsoft_graph",
      }),
      false,
    );
  });

  it("accepts microsoft_graph with OAuth token", () => {
    assert.equal(
      isEmailCampaignOutboundTransportReady({
        fromEmail: "ops@example.com",
        smtpHost: "",
        smtpUsername: "",
        hasSmtpPassword: false,
        hasOauthToken: true,
        outboundProvider: "microsoft_graph",
      }),
      true,
    );
  });

  it("never treats gmail_api alone as ready", () => {
    assert.equal(
      isEmailCampaignOutboundTransportReady({
        fromEmail: "ops@example.com",
        smtpHost: "",
        smtpUsername: "",
        hasSmtpPassword: false,
        hasOauthToken: false,
        outboundProvider: "gmail_api",
      }),
      false,
    );
  });

  it("rejects SMTP with username but no password", () => {
    assert.equal(
      isEmailCampaignOutboundTransportReady({
        fromEmail: "ops@example.com",
        smtpHost: "smtp.gmail.com",
        smtpUsername: "ops@example.com",
        hasSmtpPassword: false,
        hasOauthToken: false,
        outboundProvider: "smtp",
      }),
      false,
    );
  });
});
