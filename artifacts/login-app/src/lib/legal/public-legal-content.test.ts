import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const root = new URL("../../locales/overlays/", import.meta.url);

function load(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(new URL(name, root), "utf8")) as Record<string, unknown>;
}

describe("legal overlays", () => {
  for (const file of ["public-surfaces.en.json", "public-surfaces.ar.json", "public-surfaces.de.json"]) {
    it(`${file} names the public contact and does not invent a deadline or a certification`, () => {
      const json = load(file) as {
        legal: {
          privacy: { contactBody: string; title: string };
          dataDeletion: { afterBody: string; title: string };
          terms: { contactBody: string; title: string };
          review: { item1: string };
        };
      };
      const policyText = JSON.stringify({
        privacy: json.legal.privacy,
        dataDeletion: json.legal.dataDeletion,
        terms: json.legal.terms,
      });
      assert.match(json.legal.privacy.contactBody, /\{\{email\}\}/);
      assert.match(json.legal.privacy.contactBody, /\{\{phone\}\}/);
      assert.match(json.legal.terms.contactBody, /\{\{phone\}\}/);
      assert.match(json.legal.dataDeletion.afterBody, /\{\{email\}\}|\{\{phone\}\}|manually|يدوياً|manuell/);
      assert.doesNotMatch(policyText, /30 days|30 يوماً|30 Tagen|GDPR|DSGVO|ISO 27001/i);
      assert.match(json.legal.review.item1, /GDPR|لائحة|DSGVO/);
      if (file.endsWith(".de.json")) {
        assert.ok(json.legal.privacy.title.length > 0);
        assert.ok(json.legal.terms.title.length > 0);
        assert.ok(json.legal.dataDeletion.title.length > 0);
      }
    });
  }
});

describe("login layout", () => {
  it("places the preview in normal flow instead of an absolute overlap", () => {
    const layout = readFileSync(
      new URL("../../components/auth/login-experience-layout.tsx", import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(layout, /absolute top-/);
    assert.match(layout, /lg:grid-cols-/);
    assert.match(layout, /LoginDashboardPreview/);
    assert.match(layout, /href="\/privacy-policy"/);
    assert.match(layout, /href="\/terms"/);
    assert.match(layout, /href="\/data-deletion"/);
  });
});
