import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { APP_LANGUAGES, catalogKeys, textDirection, translate } from "./catalog";
import { languageChangePlan, planNativeDirection, readPendingDirection, storageKeysRemovedOnSignOut, DIRECTION_RELOAD_KEY, LANGUAGE_STORAGE_KEY } from "./direction";
import { aiDraftInstruction, formatLocaleDate, formatLocaleNumber, presentStoredValue } from "./present";

describe("stored value presentation", () => {
  it("translates ticket status and priority and keeps the original code out of the label", () => {
    assert.equal(presentStoredValue("en", "in_progress"), "In progress");
    assert.equal(presentStoredValue("ar", "in_progress"), "قيد المعالجة");
    assert.equal(presentStoredValue("de", "urgent"), "Dringend");
    assert.equal(presentStoredValue("en", "OPEN"), "Open");
    assert.notEqual(presentStoredValue("de", "closed"), "closed");
  });

  it("leaves unknown codes and customer names unchanged", () => {
    assert.equal(presentStoredValue("ar", "future_status"), "future_status");
    assert.equal(presentStoredValue("de", "Ada Lovelace"), "Ada Lovelace");
    assert.equal(presentStoredValue("en", "ada@example.com"), "ada@example.com");
  });

  it("localizes the AI instruction for the selected language", () => {
    assert.equal(aiDraftInstruction("en"), translate("en", "aiDraftInstruction"));
    assert.notEqual(aiDraftInstruction("ar"), aiDraftInstruction("en"));
    assert.notEqual(aiDraftInstruction("de"), aiDraftInstruction("en"));
  });

  it("formats dates and numbers for each locale and keeps an invalid date", () => {
    const stamp = "2026-11-01T12:00:00.000Z";
    assert.notEqual(formatLocaleDate("ar", stamp), formatLocaleDate("en", stamp));
    assert.equal(formatLocaleDate("de", "not-a-date"), "not-a-date");
    assert.equal(formatLocaleNumber("en", 1000), "1,000");
    assert.notEqual(formatLocaleNumber("de", 1000), formatLocaleNumber("en", 1000));
  });
});

describe("native direction plan", () => {
  it("reloads only when Arabic and the native direction disagree", () => {
    assert.equal(planNativeDirection({ isRTL: false, language: "ar" }).reload, true);
    assert.equal(planNativeDirection({ isRTL: false, language: "ar" }).forceRTL, true);
    assert.equal(planNativeDirection({ isRTL: true, language: "en" }).forceRTL, false);
    assert.equal(planNativeDirection({ isRTL: false, language: "de" }).reload, false);
    assert.equal(planNativeDirection({ isRTL: true, language: "ar" }).reload, false);
    assert.equal(textDirection("ar"), "rtl");
  });

  it("keeps the language preference when the session is removed", () => {
    assert.equal(storageKeysRemovedOnSignOut().includes(LANGUAGE_STORAGE_KEY), false);
    assert.equal(storageKeysRemovedOnSignOut().includes(DIRECTION_RELOAD_KEY), false);
    for (const language of APP_LANGUAGES) {
      assert.equal(catalogKeys(language).includes("directionReload"), true);
      assert.equal(translate(language, "languageSaveFailed").length > 0, true);
    }
  });
});

describe("language switching", () => {
  it("reloads once from English to Arabic and does not reload again on the next launch", () => {
    const first = languageChangePlan({ current: "en", next: "ar", isRTL: false, pendingReload: null, persisted: true });
    assert.equal(first.reload, true);
    assert.equal(first.forceRTL, true);
    assert.equal(first.persistPending, "rtl");
    const relaunch = languageChangePlan({ current: null, next: "ar", isRTL: false, pendingReload: first.persistPending, persisted: true });
    assert.equal(relaunch.reload, false);
    assert.equal(readPendingDirection("rtl"), "rtl");
  });

  it("reloads once from Arabic back to English and keeps a matching RTL layout", () => {
    const back = languageChangePlan({ current: "ar", next: "en", isRTL: true, pendingReload: null, persisted: true });
    assert.equal(back.reload, true);
    assert.equal(back.forceRTL, false);
    const settled = languageChangePlan({ current: null, next: "ar", isRTL: true, pendingReload: "rtl", persisted: true });
    assert.equal(settled.reload, false);
    assert.equal(settled.clearPending, true);
  });

  it("switches English and German without a reload or a new initialization", () => {
    const toGerman = languageChangePlan({ current: "en", next: "de", isRTL: false, pendingReload: null, persisted: true });
    const back = languageChangePlan({ current: "de", next: "en", isRTL: false, pendingReload: null, persisted: true });
    const repeat = languageChangePlan({ current: "en", next: "en", isRTL: false, pendingReload: null, persisted: true });
    assert.equal(toGerman.reload, false);
    assert.equal(back.reload, false);
    assert.equal(repeat.reload, false);
    assert.equal(textDirection("de"), "ltr");
  });

  it("does not reload when the language cannot be saved", () => {
    const failed = languageChangePlan({ current: "en", next: "ar", isRTL: false, pendingReload: null, persisted: false });
    assert.equal(failed.reload, false);
    assert.equal(failed.persistPending, null);
  });

  it("keeps an authenticated workspace in place for a same-direction language", () => {
    const whileSignedIn = languageChangePlan({ current: "en", next: "de", isRTL: false, pendingReload: null, persisted: true });
    assert.equal(whileSignedIn.reload, false);
    assert.equal(storageKeysRemovedOnSignOut().includes("valueor.mobile.instance"), true);
    assert.equal(storageKeysRemovedOnSignOut().includes(LANGUAGE_STORAGE_KEY), false);
  });
});
