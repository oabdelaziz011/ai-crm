import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resolveSchedulingDisplayLocale,
  truncateWhatsAppListTitle,
  WHATSAPP_LIST_ROW_TITLE_MAX,
} from "./scheduling-display-locale";

describe("scheduling-display-locale", () => {
  it("prefers explicit language", () => {
    assert.equal(resolveSchedulingDisplayLocale({ language: "ar", timezone: "UTC" }), "ar-SA");
  });

  it("maps MENA booking timezones to Arabic when language is unset", () => {
    assert.equal(
      resolveSchedulingDisplayLocale({ timezone: "Africa/Cairo" }),
      "ar-EG",
    );
  });

  it("truncates WhatsApp list titles to the platform limit", () => {
    const long = "الاثنين، 10 أغسطس 2026 · صباحاً";
    const truncated = truncateWhatsAppListTitle(long);
    assert.ok(Array.from(truncated).length <= WHATSAPP_LIST_ROW_TITLE_MAX);
    assert.ok(truncated.endsWith("…"));
  });
});
