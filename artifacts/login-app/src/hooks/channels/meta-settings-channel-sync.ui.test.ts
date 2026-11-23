import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

describe("Messenger/Instagram settings hooks refresh company_channels after upsert", () => {
  it("Messenger update invalidates companyChannelsQueryKey after settings save", () => {
    const src = readFileSync(join(here, "use-messenger-settings.ts"), "utf8");
    assert.match(src, /companyChannelsQueryKey/);
    assert.match(src, /invalidateQueries\(\{\s*queryKey:\s*companyChannelsQueryKey\(companyId\)/);
    assert.match(src, /upsertMessengerSettings/);
  });

  it("Instagram update invalidates companyChannelsQueryKey after settings save", () => {
    const src = readFileSync(join(here, "use-instagram-settings.ts"), "utf8");
    assert.match(src, /companyChannelsQueryKey/);
    assert.match(src, /invalidateQueries\(\{\s*queryKey:\s*companyChannelsQueryKey\(companyId\)/);
    assert.match(src, /upsertInstagramSettings/);
  });
});
