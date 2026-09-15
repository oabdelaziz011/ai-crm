import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  INSTAGRAM_LOGIN_GRAPH_HOST,
  INSTAGRAM_LOGIN_ME_FIELDS,
  INSTAGRAM_LOGIN_USER_FIELDS,
  instagramGraphBaseUrl,
  instagramMeUrl,
  instagramMessagesUrl,
  instagramUserLookupUrl,
  readInstagramLoginUserId,
} from "./instagram-config.js";

const config = {
  instagramBusinessAccountId: "17841400000000000",
  accessToken: "ig_user_access_token_test_value",
  verifyToken: "verify-test",
  apiVersion: "v21.0",
};

describe("Instagram Login Graph URLs", () => {
  it("uses graph.instagram.com, not Facebook Graph", () => {
    assert.equal(INSTAGRAM_LOGIN_GRAPH_HOST, "https://graph.instagram.com");
    assert.equal(instagramGraphBaseUrl("v21.0"), "https://graph.instagram.com/v21.0");
    assert.equal(instagramGraphBaseUrl("  "), "https://graph.instagram.com/v21.0");
    assert.doesNotMatch(instagramGraphBaseUrl("v21.0"), /graph\.facebook\.com/);
  });

  it("builds Instagram Login /me with user_id fields", () => {
    assert.equal(
      instagramMeUrl("v21.0"),
      "https://graph.instagram.com/v21.0/me?fields=user_id,username,name",
    );
    assert.equal(INSTAGRAM_LOGIN_ME_FIELDS, "user_id,username,name");
    assert.doesNotMatch(instagramMeUrl("v21.0"), /fields=id,name$/);
    assert.doesNotMatch(instagramMeUrl("v21.0"), /graph\.facebook\.com/);
  });

  it("builds Instagram professional account lookup on graph.instagram.com", () => {
    assert.equal(
      instagramUserLookupUrl(config),
      "https://graph.instagram.com/v21.0/17841400000000000?fields=id,user_id,username,name",
    );
    assert.equal(INSTAGRAM_LOGIN_USER_FIELDS, "id,user_id,username,name");
    assert.doesNotMatch(instagramUserLookupUrl(config), /graph\.facebook\.com/);
  });

  it("builds messaging Send API on graph.instagram.com/{IG_ID}/messages", () => {
    assert.equal(
      instagramMessagesUrl(config),
      "https://graph.instagram.com/v21.0/17841400000000000/messages",
    );
    assert.doesNotMatch(instagramMessagesUrl(config), /graph\.facebook\.com/);
    assert.doesNotMatch(instagramMessagesUrl(config), /\/me\/messages/);
  });

  it("prefers Instagram professional user_id over app-scoped id", () => {
    assert.equal(readInstagramLoginUserId({ user_id: "17841400000000000", id: "app-scoped" }), "17841400000000000");
    assert.equal(readInstagramLoginUserId({ id: "app-scoped" }), "app-scoped");
    assert.equal(readInstagramLoginUserId({}), undefined);
  });
});
