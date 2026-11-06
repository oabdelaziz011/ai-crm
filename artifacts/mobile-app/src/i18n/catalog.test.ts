import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { APP_LANGUAGES, catalogKeys, textDirection, translate } from "./catalog";

describe("mobile localization", () => {
  it("uses RTL for Arabic and LTR for English and German", () => {
    assert.equal(textDirection("ar"), "rtl");
    assert.equal(textDirection("en"), "ltr");
    assert.equal(textDirection("de"), "ltr");
  });

  it("keeps the Arabic login wording and the English and German catalogs", () => {
    assert.equal(translate("ar", "instanceUrl"), "رابط مساحة العمل");
    assert.equal(translate("ar", "email"), "البريد الإلكتروني");
    assert.equal(translate("ar", "password"), "كلمة المرور");
    assert.equal(translate("ar", "remember"), "تذكّرني");
    assert.equal(translate("ar", "signIn"), "تسجيل الدخول");
    assert.equal(translate("ar", "forgotPassword"), "نسيت كلمة المرور؟");
    assert.equal(translate("ar", "welcomeTitle"), "مرحبًا بعودتك");
    assert.equal(translate("ar", "startupFailed"), "تعذّر تشغيل ValueOR. تحقق من اتصال الإنترنت وحاول مرة أخرى.");
    assert.equal(translate("ar", "retry"), "إعادة المحاولة");
    assert.equal(translate("ar", "securityTitle"), "بياناتك آمنة ومشفرة");
    assert.equal(translate("en", "signIn"), "Sign in");
    assert.equal(translate("en", "startupFailed"), "ValueOR could not finish opening. Check your connection and try again.");
    assert.equal(translate("de", "signIn"), "Anmelden");
    assert.equal(translate("de", "welcomeTitle"), "Willkommen zurück");
  });

  it("has the same message keys in every language", () => {
    const english = catalogKeys("en");
    for (const language of APP_LANGUAGES) {
      assert.deepEqual(catalogKeys(language), english);
      assert.equal(translate(language, "signIn").length > 0, true);
    }
  });
});
