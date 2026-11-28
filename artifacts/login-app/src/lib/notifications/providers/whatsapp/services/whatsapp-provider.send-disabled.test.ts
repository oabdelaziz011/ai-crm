import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Contract: outbound WhatsApp sending stays gated by settings.enabled.
 * Template admin is handled separately and must not weaken this gate.
 */
describe("whatsapp provider outbound disabled gate", () => {
  const source = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "whatsapp-provider.ts"),
    "utf8",
  );

  it("blocks freeform / purpose / queue sends when provider is disabled", () => {
    assert.match(source, /async sendFreeformText/);
    assert.match(source, /WhatsApp provider is disabled/);
    const disabledChecks = source.match(/if\s*\(\s*!settings\?\.enabled\s*\)/g) ?? [];
    assert.ok(
      disabledChecks.length >= 2,
      `expected multiple enabled gates for outbound paths, got ${disabledChecks.length}`,
    );
  });

  it("does not define template provision/sync inside the provider send path", () => {
    assert.doesNotMatch(source, /provisionCompanyWhatsAppTemplates/);
    assert.doesNotMatch(source, /syncCompanyWhatsAppTemplatesFromMeta/);
  });
});
