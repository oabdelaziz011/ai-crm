import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readInstanceTarget, searchPattern } from "../lib/instance-url";
import { readMobileConfig } from "../lib/config";
import { canAccess, sessionFailureAction, visibleModules, type MobileSession } from "./session-policy";
import {
  memoryStore,
  requestPasswordReset,
  restoreRememberedSession,
  signInToInstance,
  signOutMobileSession,
  validateLoginDraft,
  type PasswordAuth,
} from "./sign-in";

function auth(overrides: Partial<PasswordAuth> = {}): PasswordAuth & { signedOut: boolean } {
  const state = { signedOut: false };
  return {
    get signedOut() {
      return state.signedOut;
    },
    async signInWithPassword() {
      return { data: { session: { access_token: "access-token", refresh_token: "refresh-token" } }, error: null };
    },
    async signOut() {
      state.signedOut = true;
    },
    async resetPasswordForEmail() {
      return { error: null };
    },
    ...overrides,
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const tenantBody = {
  scope: "tenant",
  isSuperAdmin: false,
  userId: "user-1",
  displayName: "Ada",
  company: { id: "company-1", name: "Acme", subdomain: "acme", status: "Active" },
  permissions: ["customers.view", "email.view"],
};

describe("instance URL", () => {
  it("normalizes tenant, platform, local, and rejected addresses", () => {
    assert.deepEqual(readInstanceTarget("https://acme.valueor.org"), {
      hostname: "acme.valueor.org",
      origin: "https://acme.valueor.org",
    });
    assert.equal(readInstanceTarget("http://demo.localhost:5173")?.hostname, "demo.localhost");
    assert.equal(readInstanceTarget("http://acme.valueor.org"), null);
    assert.equal(readInstanceTarget("https://user:pw@acme.valueor.org"), null);
    assert.equal(readInstanceTarget("d0000010-0001-4001-8001-000000000001"), null);
    assert.deepEqual(readInstanceTarget("https://acme.valueor.org/"), {
      hostname: "acme.valueor.org",
      origin: "https://acme.valueor.org",
    });
    assert.deepEqual(readInstanceTarget("acme.valueor.org"), {
      hostname: "acme.valueor.org",
      origin: "https://acme.valueor.org",
    });
    assert.deepEqual(readInstanceTarget("https://app.valueor.org"), {
      hostname: "app.valueor.org",
      origin: "https://app.valueor.org",
    });
    assert.equal(searchPattern(" 100%_off, "), "%100 off%");
  });
});

describe("login draft", () => {
  it("checks the company address, required fields, and email shape before authentication", () => {
    assert.equal(validateLoginDraft({ instanceUrl: "https://acme.valueor.org/", email: "ada@acme.com", password: "secret" }), null);
    assert.equal(validateLoginDraft({ instanceUrl: "not a url", email: "ada@acme.com", password: "secret" }), "invalid_instance");
    assert.equal(validateLoginDraft({ instanceUrl: "https://acme.valueor.org", email: " ", password: "" }), "empty_credentials");
    assert.equal(validateLoginDraft({ instanceUrl: "https://acme.valueor.org", email: "ada", password: "secret" }), "invalid_email");
  });
});

describe("mobile config", () => {
  it("requires public configuration and rejects a service-role key", () => {
    assert.equal(readMobileConfig({ apiUrl: "", supabaseUrl: "https://local", supabasePublishableKey: "anon" }).ok, false);
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url");
    const rejected = readMobileConfig({
      apiUrl: "http://127.0.0.1:3001",
      supabaseUrl: "http://127.0.0.1:54321",
      supabasePublishableKey: `${header}.${payload}.sig`,
    });
    assert.equal(rejected.ok, false);
    if (!rejected.ok) assert.equal(rejected.code, "privileged_key");
  });
});

describe("sign-in", () => {
  it("stores a remembered tenant session and rejects the security failures", async () => {
    const store = memoryStore();
    const calls: Array<{ host?: string; authorization?: string }> = [];
    const success = await signInToInstance({
      apiUrl: "http://127.0.0.1:3001",
      auth: auth(),
      store,
      fetchImpl: async (_url, init) => {
        const headers = new Headers(init?.headers);
        calls.push({ host: headers.get("X-ValueOR-Instance") ?? undefined, authorization: headers.get("Authorization") ?? undefined });
        return jsonResponse(200, tenantBody);
      },
    }, { instanceUrl: "https://acme.valueor.org", email: "user@company.com", password: "secret", remember: true });
    assert.equal(success.ok, true);
    assert.equal(calls[0]?.host, "acme.valueor.org");
    assert.equal(calls[0]?.authorization?.includes("access-token"), true);
    assert.equal((await restoreRememberedSession(store))?.instanceHostname, "acme.valueor.org");

    const deniedAuth = auth();
    const denied = await signInToInstance({
      apiUrl: "http://127.0.0.1:3001",
      auth: deniedAuth,
      store: memoryStore(),
      fetchImpl: async () => jsonResponse(403, { code: "forbidden", message: "Access denied for this company." }),
    }, { instanceUrl: "https://beta.valueor.org", email: "user@company.com", password: "secret", remember: true });
    assert.equal(denied.ok, false);
    if (!denied.ok) assert.equal(denied.code, "forbidden");
    assert.equal(deniedAuth.signedOut, true);

    const invalid = await signInToInstance({
      apiUrl: "http://127.0.0.1:3001",
      auth: auth({
        async signInWithPassword() {
          return { data: { session: null }, error: { message: "Invalid login credentials" } };
        },
      }),
      store: memoryStore(),
    }, { instanceUrl: "https://acme.valueor.org", email: "user@company.com", password: "nope", remember: false });
    assert.equal(invalid.ok, false);
    if (!invalid.ok) assert.equal(invalid.code, "invalid_credentials");

    const badUrl = await signInToInstance({
      apiUrl: "http://127.0.0.1:3001",
      auth: auth(),
      store: memoryStore(),
    }, { instanceUrl: "http://evil.example.com", email: "user@company.com", password: "secret", remember: false });
    assert.equal(badUrl.ok, false);
    if (!badUrl.ok) assert.equal(badUrl.code, "invalid_instance");
  });

  it("logs out, restores only remembered sessions, and maps expiry", async () => {
    const store = memoryStore();
    const client = auth();
    await signInToInstance({
      apiUrl: "http://127.0.0.1:3001",
      auth: client,
      store,
      fetchImpl: async () => jsonResponse(200, tenantBody),
    }, { instanceUrl: "https://acme.valueor.org", email: "user@company.com", password: "secret", remember: false });
    assert.equal(await restoreRememberedSession(store), null);
    await signOutMobileSession({ auth: client, store });
    assert.equal(client.signedOut, true);

    assert.equal(sessionFailureAction(401), "sign_out");
    assert.equal(sessionFailureAction(403), "sign_out");
    assert.equal(sessionFailureAction(503), "retry");
    const reset = await requestPasswordReset(
      { auth: auth() },
      { instanceUrl: "https://acme.valueor.org", email: "user@company.com" },
    );
    assert.equal(reset.ok, true);
  });
});

describe("permissions", () => {
  const session: MobileSession = {
    scope: "tenant",
    isSuperAdmin: false,
    userId: "user-1",
    displayName: "Ada",
    company: { id: "company-1", name: "Acme", subdomain: "acme", status: "Active" },
    permissions: ["customers.view"],
  };

  it("shows only entitled modules and blocks another tenant scope", () => {
    assert.deepEqual(visibleModules(session), ["dashboard", "notifications", "crm"]);
    assert.equal(canAccess(session, "email.view"), false);
    assert.equal(canAccess(session, "tickets.view"), false);
    assert.equal(canAccess({ ...session, scope: "platform", company: null }, "customers.view"), false);
    assert.equal(canAccess({ ...session, isSuperAdmin: true }, "tickets.view"), true);
  });
});
