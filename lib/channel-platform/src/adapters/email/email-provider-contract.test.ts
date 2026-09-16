import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EMAIL_PROVIDER_PRESETS,
  inferMailboxProvider,
  parsedInboundToNormalized,
  resolveEmailProviderCapabilities,
} from "./email-provider-contract.ts";
import { mapEmailProviderError } from "./email-provider-errors.ts";
import {
  decodeMicrosoftOAuthState,
  encodeMicrosoftOAuthState,
  buildMicrosoftAuthorizeUrl,
  readMicrosoftEmailOAuthEnv,
} from "./microsoft-email-oauth.ts";
import {
  mapGraphMessageToInboundRecord,
  MicrosoftGraphEmailClient,
} from "./microsoft-graph-email-client.ts";

describe("email provider contract", () => {
  it("resolves distinct capabilities without workspace provider switches", () => {
    assert.equal(resolveEmailProviderCapabilities("gmail").supportsOAuth, false);
    assert.equal(resolveEmailProviderCapabilities("gmail").supportsImap, true);
    assert.equal(resolveEmailProviderCapabilities("microsoft_365").supportsOAuth, true);
    assert.equal(resolveEmailProviderCapabilities("microsoft_365").supportsImap, false);
    assert.equal(resolveEmailProviderCapabilities("imap_smtp").supportsSmtp, true);
  });

  it("infers gmail from hostnames and microsoft from oauth/graph", () => {
    assert.equal(inferMailboxProvider({ smtpHost: "smtp.gmail.com" }), "gmail");
    assert.equal(inferMailboxProvider({ oauthProvider: "microsoft" }), "microsoft_365");
    assert.equal(inferMailboxProvider({ inboundProvider: "microsoft_graph" }), "microsoft_365");
    assert.equal(inferMailboxProvider({ smtpHost: "mail.corp.example" }), "imap_smtp");
  });

  it("exposes gmail IMAP/SMTP presets without hardcoding in the workspace", () => {
    assert.equal(EMAIL_PROVIDER_PRESETS.gmail.smtpHost, "smtp.gmail.com");
    assert.equal(EMAIL_PROVIDER_PRESETS.gmail.imapHost, "imap.gmail.com");
    assert.equal(EMAIL_PROVIDER_PRESETS.gmail.smtpPort, 587);
    assert.equal(EMAIL_PROVIDER_PRESETS.gmail.imapPort, 993);
  });

  it("normalizes inbound messages without leaking provider conversation ids as ValueOR ids", () => {
    const normalized = parsedInboundToNormalized(
      {
        messageId: "<a@b.c>",
        references: [],
        from: { email: "a@b.c" },
        to: [{ email: "to@b.c" }],
        subject: "Hi",
        textPlain: "body",
        attachments: [],
      },
      { providerMessageId: "graph-1", threadId: "ms-conv" },
    );
    assert.equal(normalized.messageId, "<a@b.c>");
    assert.equal(normalized.providerMessageId, "graph-1");
    assert.equal(normalized.threadId, "ms-conv");
    assert.equal(normalized.direction, "inbound");
  });
});

describe("microsoft oauth helpers", () => {
  it("round-trips opaque state without embedding secrets", () => {
    const state = encodeMicrosoftOAuthState({
      companyId: "company-a",
      userId: "user-a",
      nonce: "n1",
    });
    const decoded = decodeMicrosoftOAuthState(state);
    assert.equal(decoded?.companyId, "company-a");
    assert.equal(decoded?.userId, "user-a");
    assert.equal(decoded?.nonce, "n1");
    assert.ok(state.length > 16);
  });

  it("builds authorize URL without client secret", () => {
    const url = buildMicrosoftAuthorizeUrl(
      {
        clientId: "cid",
        clientSecret: "csecret",
        tenantId: "common",
        redirectUri: "https://app.example/callback",
      },
      { state: "abc" },
    );
    assert.ok(url.includes("client_id=cid"));
    assert.ok(!url.includes("csecret"));
    assert.ok(url.includes("login.microsoftonline.com"));
  });

  it("reports oauth env missing when secrets absent", () => {
    assert.equal(readMicrosoftEmailOAuthEnv({} as NodeJS.ProcessEnv), null);
  });
});

describe("microsoft graph mapping + send", () => {
  it("maps graph message into inbound record with Message-ID / threading headers", () => {
    const mapped = mapGraphMessageToInboundRecord({
      id: "AAMk",
      internetMessageId: "<msg@outlook.com>",
      conversationId: "conv-1",
      subject: "Hello",
      body: { contentType: "HTML", content: "<p>Hi</p>" },
      from: { emailAddress: { address: "from@contoso.com", name: "From" } },
      toRecipients: [{ emailAddress: { address: "to@contoso.com" } }],
      ccRecipients: [],
      internetMessageHeaders: [
        { name: "In-Reply-To", value: "<prev@outlook.com>" },
        { name: "References", value: "<root@outlook.com> <prev@outlook.com>" },
      ],
      receivedDateTime: "2026-01-01T00:00:00Z",
      isRead: false,
    });
    assert.equal(mapped.messageId, "<msg@outlook.com>");
    assert.equal(mapped.inReplyTo, "<prev@outlook.com>");
    assert.deepEqual(mapped.references, ["<root@outlook.com>", "<prev@outlook.com>"]);
    assert.equal((mapped.from as { email: string }).email, "from@contoso.com");
    // Graph conversationId is metadata only — not the ValueOR conversation id.
    assert.equal(mapped.microsoftConversationId, "conv-1");
  });

  it("sends via Graph with To/Cc/Bcc and never echoes the access token in errors", async () => {
    let sawAuth = false;
    const client = new MicrosoftGraphEmailClient({
      fetchImpl: (async (_url, init) => {
        const headers = init?.headers as Record<string, string>;
        sawAuth = Boolean(headers?.Authorization?.startsWith("Bearer "));
        assert.ok(!JSON.stringify(init?.body ?? "").includes("secret-token"));
        return new Response(null, { status: 202 });
      }) as typeof fetch,
    });
    const result = await client.send(
      { accessToken: "secret-token" },
      {
        to: ["a@example.com"],
        cc: ["b@example.com"],
        bcc: ["c@example.com"],
        subject: "Test",
        text: "hello",
      },
    );
    assert.ok(sawAuth);
    assert.ok(result.messageId.includes("@valueor.local"));
    assert.ok(result.accepted.includes("a@example.com"));
    assert.ok(result.accepted.includes("b@example.com"));
    assert.ok(result.accepted.includes("c@example.com"));
  });
});

describe("provider error mapping", () => {
  it("maps oauth expiry and auth failures to safe codes", () => {
    assert.equal(mapEmailProviderError(new Error("invalid_grant")).code, "email_provider.oauth_expired");
    assert.equal(mapEmailProviderError(new Error("535 Authentication failed")).code, "email_provider.auth_invalid");
    assert.ok(!mapEmailProviderError(new Error("password=supersecret")).logMessage.includes("supersecret"));
  });
});
