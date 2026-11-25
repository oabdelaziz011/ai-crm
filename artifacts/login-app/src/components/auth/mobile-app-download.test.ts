import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, "mobile-app-download.tsx"), "utf8");

describe("MobileAppDownload placeholder store icons", () => {
  it("renders Android and iPhone icon slots even while download links are pending", () => {
    assert.match(source, /data-testid="mobile-app-android"/);
    assert.match(source, /data-testid="mobile-app-ios"/);
    assert.match(source, /function AndroidIcon/);
    assert.match(source, /function AppleIcon/);
    assert.match(source, /auth\.login\.mobileApps\.androidPending/);
    assert.match(source, /auth\.login\.mobileApps\.iosPending/);
  });
});
