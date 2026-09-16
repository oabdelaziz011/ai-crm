import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_APP_THEME,
  resolveAppTheme,
  resolveEffectiveTheme,
} from "./resolve-app-theme.ts";

describe("resolveAppTheme", () => {
  it("defaults to light when preference is missing", () => {
    assert.equal(DEFAULT_APP_THEME, "light");
    assert.equal(resolveAppTheme(null), "light");
    assert.equal(resolveAppTheme(undefined), "light");
    assert.equal(resolveAppTheme(""), "light");
    assert.equal(resolveAppTheme("bogus"), "light");
  });

  it("preserves an existing saved preference", () => {
    assert.equal(resolveAppTheme("dark"), "dark");
    assert.equal(resolveAppTheme("system"), "system");
    assert.equal(resolveAppTheme("light"), "light");
  });
});

describe("resolveEffectiveTheme", () => {
  it("passes light and dark through", () => {
    assert.equal(resolveEffectiveTheme("light"), "light");
    assert.equal(resolveEffectiveTheme("dark"), "dark");
  });
});
