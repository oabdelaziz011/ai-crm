import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  instagramMeUrl,
  instagramMessagesUrl,
  instagramUserLookupUrl,
} from "./instagram-config.js";
import { performInstagramOutboundHealthCheck } from "./instagram-outbound-health.js";

const IG_USER_ID = "17841400000000000";
const TOKEN = "ig_user_access_token_test_value";

const config = {
  instagramBusinessAccountId: IG_USER_ID,
  accessToken: TOKEN,
  verifyToken: "verify-test",
  apiVersion: "v21.0",
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("performInstagramOutboundHealthCheck Instagram Login Graph host", () => {
  it("calls graph.instagram.com for /me, account lookup, and messages — never Facebook Graph", async () => {
    const urls: string[] = [];
    const methods: string[] = [];

    const report = await performInstagramOutboundHealthCheck({
      companyId: "co-1",
      runtimeConfig: config,
      fetchFn: async (input, init) => {
        const url = String(input);
        urls.push(url);
        methods.push(String(init?.method ?? "GET"));
        assert.doesNotMatch(url, /graph\.facebook\.com/);
        assert.match(url, /^https:\/\/graph\.instagram\.com\/v21\.0\//);

        if (url.includes("/me?")) {
          return jsonResponse(200, { user_id: IG_USER_ID, username: "clinic.ig", name: "Clinic" });
        }
        if (url.includes(`/${IG_USER_ID}?fields=`)) {
          return jsonResponse(200, { id: IG_USER_ID, user_id: IG_USER_ID, username: "clinic.ig", name: "Clinic" });
        }
        if (url.endsWith(`/${IG_USER_ID}/messages`)) {
          return jsonResponse(400, { error: { message: "Invalid recipient", code: 100 } });
        }
        throw new Error(`unexpected url ${url}`);
      },
    });

    assert.deepEqual(urls, [
      instagramMeUrl("v21.0"),
      instagramUserLookupUrl(config),
      instagramMessagesUrl(config),
    ]);
    assert.deepEqual(methods, ["GET", "GET", "POST"]);
    assert.equal(report.accessToken.valid, true);
    assert.equal(report.accessToken.ownerId, IG_USER_ID);
    assert.equal(report.instagramAccount.ok, true);
    assert.equal(report.ok, true);
    assert.equal(report.endpoint, instagramMessagesUrl(config));
    assert.doesNotMatch(report.endpoint, /graph\.facebook\.com/);
  });

  it("does not treat Facebook /me id,name as the Instagram Login contract", async () => {
    assert.match(instagramMeUrl("v21.0"), /fields=user_id,username,name/);
    assert.doesNotMatch(instagramMeUrl("v21.0"), /\/me\?fields=id,name$/);
  });

  it("records Graph host mismatch-style /me failures without marking the token valid", async () => {
    const report = await performInstagramOutboundHealthCheck({
      companyId: "co-1",
      runtimeConfig: config,
      fetchFn: async (input) => {
        const url = String(input);
        if (url.includes("/me?")) {
          return jsonResponse(400, {
            error: { message: "Invalid OAuth access token - Cannot parse access token", code: 190 },
          });
        }
        return jsonResponse(400, { error: { message: "Meta API request failed", code: 190 } });
      },
    });

    assert.equal(report.accessToken.valid, false);
    assert.equal(report.ok, false);
    assert.equal(report.metaErrorCode, 190);
    assert.match(report.error ?? "", /Invalid OAuth access token/);
  });
});
