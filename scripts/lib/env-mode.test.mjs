import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertLocalMetaOauthSafety,
  assertProductionEnvironmentSafety,
  assertStagingEnvironmentSafety,
  isRecordedProductionSupabaseUrl,
  recordedProductionSupabaseOrigin,
  resolveValueorEnv,
} from "./env-mode.mjs";

const stagingBase = {
  VALUEOR_ENV: "staging",
  SUPABASE_URL: "https://staging-example.supabase.co",
  VITE_API_SERVER_URL: "https://staging-api.example.test",
  DATABASE_URL: "postgresql://postgres.staging-example:placeholder@aws-0-eu-north-1.pooler.supabase.com:5432/postgres",
  SESSION_SECRET: "staging-session-secret",
  INTERNAL_API_KEY: "staging-internal-key",
  SUPABASE_SERVICE_ROLE_KEY: "staging-service-role",
};

describe("environment isolation", () => {
  it("keeps staging distinct from local and production", () => {
    assert.equal(resolveValueorEnv("staging"), "staging");
    assert.equal(resolveValueorEnv("stage"), "staging");
    assert.equal(resolveValueorEnv("local"), "local");
    assert.equal(resolveValueorEnv("production"), "production");
    assert.equal(resolveValueorEnv("preview"), "local");
  });

  it("rejects a staging profile that points at Production or loopback", () => {
    assert.doesNotThrow(() => assertStagingEnvironmentSafety(stagingBase));
    assert.throws(
      () => assertStagingEnvironmentSafety({ ...stagingBase, SUPABASE_URL: recordedProductionSupabaseOrigin() }),
      /recorded Production project/,
    );
    assert.throws(
      () => assertStagingEnvironmentSafety({ ...stagingBase, VITE_API_SERVER_URL: "https://api.valueor.org" }),
      /local listener or a non-Production HTTPS tunnel/,
    );
    assert.doesNotThrow(() => assertStagingEnvironmentSafety({
      ...stagingBase,
      VITE_API_SERVER_URL: "http://127.0.0.1:3011",
      EXPO_PUBLIC_API_URL: "",
    }));
    assert.throws(
      () => assertStagingEnvironmentSafety({ ...stagingBase, EXPO_PUBLIC_API_URL: "https://api.valueor.org" }),
      /temporary HTTPS tunnel/,
    );
    assert.throws(
      () => assertStagingEnvironmentSafety({ ...stagingBase, SUPABASE_URL: "http://127.0.0.1:54321" }),
      /hosted Supabase project/,
    );
    const origin = recordedProductionSupabaseOrigin();
    const ref = new URL(origin).hostname.split(".")[0];
    try {
      assertStagingEnvironmentSafety({ ...stagingBase, SUPABASE_URL: origin });
    } catch (error) {
      assert.equal(error instanceof Error && error.message.includes(ref), false);
      assert.equal(isRecordedProductionSupabaseUrl(origin), true);
    }
  });

  it("rejects staging credentials when the process is production", () => {
    assert.doesNotThrow(() => assertProductionEnvironmentSafety({
      VALUEOR_ENV: "production",
      SUPABASE_URL: recordedProductionSupabaseOrigin(),
    }));
    assert.throws(
      () => assertProductionEnvironmentSafety({
        VALUEOR_ENV: "production",
        SUPABASE_URL: "https://staging-example.supabase.co",
      }),
      /not the recorded Production project/,
    );
    assert.doesNotThrow(() => assertProductionEnvironmentSafety({ VALUEOR_ENV: "local", SUPABASE_URL: "http://127.0.0.1:54321" }));
  });

  it("rejects local Meta OAuth tooling aimed at Production", () => {
    assert.doesNotThrow(() =>
      assertLocalMetaOauthSafety({
        VALUEOR_ENV: "local",
        SUPABASE_URL: "http://127.0.0.1:54321",
        WEBHOOK_BASE_URL: "https://webhook-alice.example.test",
        META_OAUTH_PUBLIC_API_BASE_URL: "https://webhook-alice.example.test",
      }),
    );
    assert.throws(
      () =>
        assertLocalMetaOauthSafety({
          VALUEOR_ENV: "local",
          SUPABASE_URL: recordedProductionSupabaseOrigin(),
        }),
      /recorded Production project/,
    );
    assert.throws(
      () =>
        assertLocalMetaOauthSafety({
          VALUEOR_ENV: "local",
          SUPABASE_URL: "http://127.0.0.1:54321",
          WEBHOOK_BASE_URL: "https://webhook.valueor.org",
        }),
      /webhook\.valueor\.org/,
    );
  });
});
