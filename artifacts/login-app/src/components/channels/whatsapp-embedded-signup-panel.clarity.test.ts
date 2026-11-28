import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

describe("WhatsApp Embedded Signup WABA clarity", () => {
  const dir = dirname(fileURLToPath(import.meta.url));
  const panel = readFileSync(join(dir, "whatsapp-embedded-signup-panel.tsx"), "utf8");
  const settingsPage = readFileSync(
    join(dir, "../../pages/dashboard/settings/whatsapp-settings-page.tsx"),
    "utf8",
  );

  it("displays authoritative company settings WABA separately from historical ES event IDs", () => {
    assert.match(panel, /currentBusinessAccountId/);
    assert.match(panel, /currentPhoneNumberId/);
    assert.match(panel, /whatsapp-onboarding-current-connection/);
    assert.match(panel, /whatsapp-onboarding-historical-ids/);
    assert.match(panel, /historicalEventIdsLabel/);
    assert.match(panel, /currentConnectionLabel/);
    assert.match(settingsPage, /currentBusinessAccountId=\{settings\?\.businessAccountId/);
    assert.match(settingsPage, /currentPhoneNumberId=\{settings\?\.phoneNumberId/);
  });

  it("does not present lifecycle history WABA as the sole connected account display", () => {
    assert.doesNotMatch(
      panel,
      /phone_number_id:\s*\{connectedPhone\}\s*\{connectedWaba\s*\?\s*` · WABA:/,
    );
    assert.match(panel, /showHistoricalIds/);
  });
});
