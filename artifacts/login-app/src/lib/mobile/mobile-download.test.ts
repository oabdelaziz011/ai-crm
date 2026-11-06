import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveMobileDownload } from "./mobile-download";

describe("login mobile download", () => {
  it("hides download controls until a verified https APK URL is configured", () => {
    const pending = resolveMobileDownload({ androidApkUrl: "", androidVersion: "0.1.0" });
    assert.equal(pending.androidStatus, "pending");
    assert.equal(pending.androidUrl, null);
    assert.equal(pending.showQr, false);
    assert.equal(pending.iosStatus, "app_store_pending");

    const insecure = resolveMobileDownload({ androidApkUrl: "http://downloads.valueor.org/valueor.apk" });
    assert.equal(insecure.androidUrl, null);
    const fake = resolveMobileDownload({ androidApkUrl: "https://example.com/not-an-apk" });
    assert.equal(fake.showQr, false);
  });

  it("shows the Android URL and QR only for an https apk", () => {
    const ready = resolveMobileDownload({
      androidApkUrl: "https://downloads.valueor.org/android/valueor-0.1.0.apk",
      androidVersion: "0.1.0",
    });
    assert.equal(ready.androidStatus, "ready");
    assert.equal(ready.showQr, true);
    assert.equal(ready.androidVersion, "0.1.0");
    assert.equal(JSON.stringify(ready).includes(".ipa"), false);
  });
});
