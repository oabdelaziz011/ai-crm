import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  composerDirAttribute,
  composerTextAlign,
  detectFirstStrongDirection,
  detectTextDirection,
  resolveLocaleTextDirection,
} from "./text-direction";

describe("detectFirstStrongDirection", () => {
  it("detects Arabic as rtl", () => {
    assert.equal(detectFirstStrongDirection("مرحبا كيف يمكنني مساعدتك؟"), "rtl");
    assert.equal(composerDirAttribute("السلام عليكم، كيف يمكنني مساعدتك؟"), "rtl");
  });

  it("detects English as ltr", () => {
    assert.equal(detectFirstStrongDirection("Hello, how can I help you?"), "ltr");
    assert.equal(composerDirAttribute("Hello, how can I help you?"), "ltr");
  });

  it("uses first strong character for mixed Arabic/English", () => {
    assert.equal(detectFirstStrongDirection("Hello أحمد"), "ltr");
    assert.equal(composerDirAttribute("Hello أحمد"), "ltr");
    assert.equal(detectFirstStrongDirection("أهلاً John"), "rtl");
    assert.equal(composerDirAttribute("أهلاً John"), "rtl");
  });

  it("empty string uses locale fallback", () => {
    assert.equal(detectFirstStrongDirection(""), null);
    assert.equal(detectTextDirection(""), "auto");
    assert.equal(composerDirAttribute("", "rtl"), "rtl");
    assert.equal(composerDirAttribute("   ", "ltr"), "ltr");
    assert.equal(composerDirAttribute(""), "ltr");
  });

  it("skips numbers/punctuation before Arabic", () => {
    assert.equal(detectFirstStrongDirection("123 أهلاً"), "rtl");
    assert.equal(detectFirstStrongDirection("...مرحبا"), "rtl");
    assert.equal(composerDirAttribute("42 Hello"), "ltr");
  });

  it("skips emoji before Arabic or Latin", () => {
    assert.equal(detectFirstStrongDirection("👋 أهلاً"), "rtl");
    assert.equal(detectFirstStrongDirection("👋 Hello"), "ltr");
  });

  it("preserves mention tokens without breaking first-strong detection", () => {
    // "@agent" contributes Latin letters after the neutral "@".
    assert.equal(detectFirstStrongDirection("@agent مرحبا"), "ltr");
    assert.equal(detectFirstStrongDirection("مرحبا @agent"), "rtl");
    assert.equal(detectFirstStrongDirection("@agent hello"), "ltr");
  });
});

describe("composerTextAlign / locale helper", () => {
  it("maps direction to text alignment", () => {
    assert.equal(composerTextAlign("rtl"), "right");
    assert.equal(composerTextAlign("ltr"), "left");
  });

  it("resolves locale fallback from language codes", () => {
    assert.equal(resolveLocaleTextDirection("ar"), "rtl");
    assert.equal(resolveLocaleTextDirection("ar-SA"), "rtl");
    assert.equal(resolveLocaleTextDirection("rtl"), "rtl");
    assert.equal(resolveLocaleTextDirection("en"), "ltr");
    assert.equal(resolveLocaleTextDirection("en-US"), "ltr");
  });
});
