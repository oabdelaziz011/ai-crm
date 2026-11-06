import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { assessMobileBuildTarget, classifyMobileAddress, endpointEnvironment, readMobileConfig } from "./config";

const publicConfig = {
  apiUrl: "https://preview.example.test",
  supabaseUrl: "https://preview.example.test",
  supabasePublishableKey: "publishable-key",
};

describe("mobile build target", () => {
  it("allows a desktop loopback configuration and a local Metro session pointed at staging", () => {
    const local = assessMobileBuildTarget({
      profile: "local",
      apiUrl: "http://127.0.0.1:3001",
      supabaseUrl: "http://127.0.0.1:54321",
      supabasePublishableKey: "publishable-key",
    });
    assert.equal(local.ok, true);
    const empty = assessMobileBuildTarget({ profile: "local", apiUrl: "", supabaseUrl: "", supabasePublishableKey: "" });
    assert.equal(empty.ok, true);
    const metroStaging = assessMobileBuildTarget({
      profile: "local",
      ...publicConfig,
      recordedProductionHost: "production.supabase.co",
    });
    assert.equal(metroStaging.ok, true);
    const metroProduction = assessMobileBuildTarget({
      profile: "local",
      apiUrl: "https://api.valueor.org",
      supabaseUrl: "https://production.supabase.co",
      supabasePublishableKey: "publishable-key",
      recordedProductionHost: "production.supabase.co",
    });
    assert.equal(metroProduction.ok, false);
    if (!metroProduction.ok) assert.equal(metroProduction.code, "production_target");
  });

  it("rejects a loopback, cleartext, or privileged preview build", () => {
    const loopback = assessMobileBuildTarget({
      profile: "preview",
      apiUrl: "http://127.0.0.1:3001",
      supabaseUrl: "http://10.0.2.2:54321",
      supabasePublishableKey: "publishable-key",
    });
    assert.equal(loopback.ok, false);
    if (!loopback.ok) assert.equal(loopback.code, "loopback_url");
    const emulator = assessMobileBuildTarget({
      profile: "preview",
      apiUrl: "http://10.0.2.2:3001",
      supabaseUrl: "http://10.0.2.2:54321",
      supabasePublishableKey: "publishable-key",
    });
    assert.equal(emulator.ok, false);
    if (!emulator.ok) assert.equal(emulator.code, "insecure_preview_url");
    const staging = assessMobileBuildTarget({
      profile: "preview",
      ...publicConfig,
      recordedProductionHost: "production.supabase.co",
    });
    assert.equal(staging.ok, true);
    const privileged = assessMobileBuildTarget({
      profile: "preview",
      ...publicConfig,
      supabasePublishableKey: "service_role-key",
    });
    assert.equal(privileged.ok, false);
    if (!privileged.ok) assert.equal(privileged.code, "privileged_key");
    const secretKey = assessMobileBuildTarget({
      profile: "preview",
      ...publicConfig,
      supabasePublishableKey: "sb_secret_example",
    });
    assert.equal(secretKey.ok, false);
    if (!secretKey.ok) assert.equal(secretKey.code, "privileged_key");
    const publicConfigResult = readMobileConfig({ ...publicConfig, supabasePublishableKey: "service_role-key" });
    assert.equal(publicConfigResult.ok, false);
    if (!publicConfigResult.ok) assert.equal(publicConfigResult.code, "privileged_key");
  });

  it("requires HTTPS for a production build", () => {
    const http = assessMobileBuildTarget({
      profile: "production",
      apiUrl: "http://10.0.2.2:3001",
      supabaseUrl: "https://preview.example.test",
      supabasePublishableKey: "publishable-key",
    });
    assert.equal(http.ok, false);
    if (!http.ok) assert.equal(http.code, "insecure_production_url");
    const production = assessMobileBuildTarget({
      profile: "production",
      apiUrl: "https://api.valueor.org",
      supabaseUrl: "https://production.supabase.co",
      supabasePublishableKey: "publishable-key",
      recordedProductionHost: "production.supabase.co",
    });
    assert.equal(production.ok, true);
    const previewOnProduction = assessMobileBuildTarget({
      profile: "preview",
      apiUrl: "https://api.valueor.org",
      supabaseUrl: "https://production.supabase.co",
      supabasePublishableKey: "publishable-key",
      recordedProductionHost: "production.supabase.co",
    });
    assert.equal(previewOnProduction.ok, false);
    if (!previewOnProduction.ok) assert.equal(previewOnProduction.code, "production_target");
    const productionMismatch = assessMobileBuildTarget({
      profile: "production",
      ...publicConfig,
      recordedProductionHost: "production.supabase.co",
    });
    assert.equal(productionMismatch.ok, false);
    if (!productionMismatch.ok) assert.equal(productionMismatch.code, "staging_target");
  });

  it("keeps the development profile on a local address and pairs each profile with one environment", () => {
    assert.equal(classifyMobileAddress("http://10.0.2.2:3001"), "android-emulator");
    assert.equal(classifyMobileAddress("http://192.168.1.20:3001"), "lan-device");
    assert.equal(classifyMobileAddress("http://127.0.0.1:3001"), "desktop-loopback");
    const emulator = assessMobileBuildTarget({
      profile: "development",
      apiUrl: "http://10.0.2.2:3001",
      supabaseUrl: "http://10.0.2.2:54321",
      supabasePublishableKey: "publishable-key",
    });
    assert.equal(emulator.ok, true);
    const phone = assessMobileBuildTarget({
      profile: "development",
      apiUrl: "http://192.168.1.20:3001",
      supabaseUrl: "http://192.168.1.20:54321",
      supabasePublishableKey: "publishable-key",
    });
    assert.equal(phone.ok, true);
    const cloudOnDevelopment = assessMobileBuildTarget({
      profile: "development",
      ...publicConfig,
    });
    assert.equal(cloudOnDevelopment.ok, false);
    if (!cloudOnDevelopment.ok) assert.equal(cloudOnDevelopment.code, "development_not_local");
    assert.equal(endpointEnvironment("https://preview.example.test", "production.supabase.co"), "staging");
    assert.equal(endpointEnvironment("https://api.valueor.org", "production.supabase.co"), "production");
    assert.equal(endpointEnvironment("https://production.supabase.co", "production.supabase.co"), "production");
    const eas = JSON.parse(readFileSync(new URL("../../eas.json", import.meta.url), "utf8")) as {
      build: { development: { environment: string }; preview: { environment: string }; production: { environment: string } };
    };
    assert.equal(eas.build.development.environment, "development");
    assert.equal(eas.build.preview.environment, "preview");
    assert.equal(eas.build.production.environment, "production");
  });

  it("keeps the preview profile as an internal Android APK", () => {
    const eas = JSON.parse(readFileSync(new URL("../../eas.json", import.meta.url), "utf8")) as {
      build: { preview: { distribution: string; android: { buildType: string } }; production: { android: { buildType: string } } };
    };
    assert.equal(eas.build.preview.distribution, "internal");
    assert.equal(eas.build.preview.android.buildType, "apk");
    assert.equal(eas.build.production.android.buildType, "app-bundle");
  });

  it("keeps staging-apk on the staging HTTPS pair and an installable APK", () => {
    const eas = JSON.parse(readFileSync(new URL("../../eas.json", import.meta.url), "utf8")) as {
      build: {
        "staging-apk": { environment: string; distribution: string; android: { buildType: string } };
        production: { environment: string; android: { buildType: string } };
      };
    };
    assert.equal(eas.build["staging-apk"].environment, "preview");
    assert.notEqual(eas.build["staging-apk"].environment, "production");
    assert.equal(eas.build["staging-apk"].distribution, "internal");
    assert.equal(eas.build["staging-apk"].android.buildType, "apk");
    assert.equal(eas.build.production.environment, "production");
    assert.equal(eas.build.production.android.buildType, "app-bundle");
    const staging = assessMobileBuildTarget({
      profile: "staging-apk",
      ...publicConfig,
      recordedProductionHost: "production.supabase.co",
    });
    assert.equal(staging.ok, true);
    const production = assessMobileBuildTarget({
      profile: "staging-apk",
      apiUrl: "https://api.valueor.org",
      supabaseUrl: "https://production.supabase.co",
      supabasePublishableKey: "publishable-key",
      recordedProductionHost: "production.supabase.co",
    });
    assert.equal(production.ok, false);
    if (!production.ok) assert.equal(production.code, "production_target");
    const missing = assessMobileBuildTarget({
      profile: "staging-apk",
      apiUrl: "",
      supabaseUrl: "",
      supabasePublishableKey: "",
    });
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.equal(missing.code, "missing_config");
    const privileged = assessMobileBuildTarget({
      profile: "staging-apk",
      ...publicConfig,
      supabasePublishableKey: "sb_secret_example",
    });
    assert.equal(privileged.ok, false);
    if (!privileged.ok) assert.equal(privileged.code, "privileged_key");
  });
});
