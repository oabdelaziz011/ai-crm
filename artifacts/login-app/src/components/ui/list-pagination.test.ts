import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, "list-pagination.tsx"), "utf8");
const enCommon = readFileSync(resolve(here, "../../locales/en/common.json"), "utf8");
const arCommon = readFileSync(resolve(here, "../../locales/ar/common.json"), "utf8");

describe("ListPagination RTL/LTR contract", () => {
  it("rotates chevrons in RTL without reversing flex row", () => {
    assert.ok(source.includes("ChevronLeft"));
    assert.ok(source.includes("ChevronRight"));
    assert.ok(source.includes("rtl:rotate-180"));
    assert.equal(source.includes("flex-row-reverse"), false);
  });

  it("keeps Previous button markup before Next in DOM order", () => {
    const prevButton = source.indexOf("{previousLabel}");
    const nextButton = source.lastIndexOf("{nextLabel}");
    assert.ok(prevButton > 0);
    assert.ok(nextButton > prevButton);
  });

  it("inherits ambient i18n direction (no forced dir on the strip)", () => {
    assert.equal(source.includes('dir="ltr"'), false);
    assert.equal(source.includes('dir="rtl"'), false);
  });

  it("exposes accessible names for Previous and Next", () => {
    assert.ok(source.includes("pagination.previousAria"));
    assert.ok(source.includes("pagination.nextAria"));
    assert.ok(source.includes("pagination.navLabel"));
  });

  it("ships English and Arabic pagination locale keys", () => {
    for (const locale of [enCommon, arCommon]) {
      const parsed = JSON.parse(locale) as {
        pagination: Record<string, string>;
      };
      assert.ok(parsed.pagination.previous);
      assert.ok(parsed.pagination.next);
      assert.ok(parsed.pagination.pageInfo);
      assert.ok(parsed.pagination.navLabel);
      assert.ok(parsed.pagination.previousAria);
      assert.ok(parsed.pagination.nextAria);
    }
  });
});
