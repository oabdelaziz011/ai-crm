import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const root = new URL("../../locales/overlays/", import.meta.url);
const pagesRoot = new URL("../../pages/legal/", import.meta.url);

function load(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(new URL(name, root), "utf8")) as Record<string, unknown>;
}

describe("legal overlays", () => {
  for (const file of ["public-surfaces.en.json", "public-surfaces.ar.json", "public-surfaces.de.json"]) {
    it(`${file} aligns privacy/deletion copy without internal notes or invented SLAs`, () => {
      const json = load(file) as {
        legal: {
          privacy: {
            contactBody: string;
            title?: string;
            aiP1: string;
            retentionP1: string;
            deletionP1: string;
            metaP1: string;
          };
          dataDeletion: { afterP1: string; afterP3: string; title?: string; requestBody: string };
          terms: { contactBody: string; title?: string };
          review?: unknown;
        };
      };

      assert.equal(json.legal.review, undefined);

      const policyText = JSON.stringify({
        privacy: json.legal.privacy,
        dataDeletion: json.legal.dataDeletion,
        terms: json.legal.terms,
      });

      assert.match(json.legal.privacy.contactBody, /\{\{email\}\}/);
      assert.match(json.legal.privacy.contactBody, /\{\{phone\}\}/);
      assert.match(json.legal.terms.contactBody, /\{\{phone\}\}/);
      assert.match(json.legal.privacy.aiP1, /OpenAI/);
      assert.match(json.legal.privacy.deletionP1, /valueor@admin\.org/);
      assert.match(json.legal.privacy.deletionP1, /valueor\.org\/data-deletion/);
      assert.match(json.legal.dataDeletion.afterP1, /manually|يدوي|manuell/i);
      assert.match(json.legal.dataDeletion.afterP3, /OpenAI|Meta/);
      assert.doesNotMatch(policyText, /30 days|30 يوماً|30 Tagen|ISO 27001/i);
      assert.doesNotMatch(
        policyText,
        /يحتاج إلى تأكيد|ما زال يحتاج|تحتاج إلى تأكيد|needs owner confirmation|needs legal confirmation|Bestätigung des Inhabers|rechtliche Bestätigung/i,
      );
      assert.doesNotMatch(policyText, /we do not sell|لا نبيع|wir verkaufen keine/i);

      if (file.endsWith(".de.json")) {
        assert.ok((json.legal.privacy.title ?? "").length > 0);
        assert.ok((json.legal.terms.title ?? "").length > 0);
        assert.ok((json.legal.dataDeletion.title ?? "").length > 0);
      }
    });
  }
});

describe("legal pages", () => {
  it("privacy and data-deletion pages do not render the internal review notice", () => {
    const privacy = readFileSync(new URL("privacy-policy-page.tsx", pagesRoot), "utf8");
    const deletion = readFileSync(new URL("data-deletion-page.tsx", pagesRoot), "utf8");
    const terms = readFileSync(new URL("terms-page.tsx", pagesRoot), "utf8");
    assert.doesNotMatch(privacy, /LegalReviewNotice/);
    assert.doesNotMatch(deletion, /LegalReviewNotice/);
    assert.doesNotMatch(terms, /LegalReviewNotice/);
    assert.match(privacy, /legal\.privacy\.aiP1/);
    assert.match(privacy, /legal\.privacy\.metaP1/);
    assert.match(deletion, /legal\.dataDeletion\.afterP1/);
  });
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
