import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isInstagramLoginOnlyAppId,
  isMetaNumericAppId,
  VALUEOR_INSTAGRAM_LOGIN_APP_ID,
} from "./meta-oauth-state.js";
import { readMetaMessengerOauthEnvConfig } from "./meta-messenger-oauth-flags.js";
import { readMetaEmbeddedSignupEnvConfig } from "./whatsapp-embedded-signup-flags.js";

describe("Meta Facebook App ID guards", () => {
  it("accepts numeric Meta App IDs and rejects junk", () => {
    assert.equal(isMetaNumericAppId("1400885884891475"), true);
    assert.equal(isMetaNumericAppId(""), false);
    assert.equal(isMetaNumericAppId("undefined"), false);
    assert.equal(isMetaNumericAppId("null"), false);
  });

  it("identifies the Instagram Login-only App ID", () => {
    assert.equal(isInstagramLoginOnlyAppId(VALUEOR_INSTAGRAM_LOGIN_APP_ID), true);
    assert.equal(isInstagramLoginOnlyAppId("1400885884891475"), false);
  });

  it("refuses Instagram Login App ID for Messenger Facebook OAuth config", () => {
    const prevId = process.env.META_MESSENGER_OAUTH_APP_ID;
    const prevSecret = process.env.META_MESSENGER_OAUTH_APP_SECRET;
    const prevPagesId = process.env.META_PAGES_OAUTH_APP_ID;
    const prevEsId = process.env.META_EMBEDDED_SIGNUP_APP_ID;
    try {
      process.env.META_MESSENGER_OAUTH_APP_ID = VALUEOR_INSTAGRAM_LOGIN_APP_ID;
      process.env.META_MESSENGER_OAUTH_APP_SECRET = "x".repeat(32);
      delete process.env.META_PAGES_OAUTH_APP_ID;
      delete process.env.META_EMBEDDED_SIGNUP_APP_ID;
      assert.equal(readMetaMessengerOauthEnvConfig("https://api.valueor.org"), null);
    } finally {
      if (prevId === undefined) delete process.env.META_MESSENGER_OAUTH_APP_ID;
      else process.env.META_MESSENGER_OAUTH_APP_ID = prevId;
      if (prevSecret === undefined) delete process.env.META_MESSENGER_OAUTH_APP_SECRET;
      else process.env.META_MESSENGER_OAUTH_APP_SECRET = prevSecret;
      if (prevPagesId === undefined) delete process.env.META_PAGES_OAUTH_APP_ID;
      else process.env.META_PAGES_OAUTH_APP_ID = prevPagesId;
      if (prevEsId === undefined) delete process.env.META_EMBEDDED_SIGNUP_APP_ID;
      else process.env.META_EMBEDDED_SIGNUP_APP_ID = prevEsId;
    }
  });

  it("refuses Instagram Login App ID for WhatsApp Embedded Signup config", () => {
    const prevId = process.env.META_EMBEDDED_SIGNUP_APP_ID;
    const prevSecret = process.env.META_EMBEDDED_SIGNUP_APP_SECRET;
    try {
      process.env.META_EMBEDDED_SIGNUP_APP_ID = VALUEOR_INSTAGRAM_LOGIN_APP_ID;
      process.env.META_EMBEDDED_SIGNUP_APP_SECRET = "x".repeat(32);
      assert.equal(readMetaEmbeddedSignupEnvConfig(), null);
    } finally {
      if (prevId === undefined) delete process.env.META_EMBEDDED_SIGNUP_APP_ID;
      else process.env.META_EMBEDDED_SIGNUP_APP_ID = prevId;
      if (prevSecret === undefined) delete process.env.META_EMBEDDED_SIGNUP_APP_SECRET;
      else process.env.META_EMBEDDED_SIGNUP_APP_SECRET = prevSecret;
    }
  });
});
