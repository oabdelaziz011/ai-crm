import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildBrandThemeCssVariables } from "./brand-theme-service.ts";

describe("buildBrandThemeCssVariables sidebar chrome", () => {
  it("maps light-mode sidebar from dedicated sidebar fields (not primary)", () => {
    const tokens = buildBrandThemeCssVariables(
      {
        primary: "#FF0000",
        secondary: "#9BD2B2",
        accent: "#00E6CB",
        background: "#FFFFFF",
        surface: "#FFFFFF",
        sidebar: "#005747",
        sidebarActive: "#00E6CB",
        sidebarAccent: "#0F766E",
      },
      "light",
    );

    // Sidebar #005747 must drive rail — not button primary red.
    assert.match(tokens["--sidebar"]!, /^1[56][0-9] /);
    assert.notEqual(tokens["--sidebar"], tokens["--background"]);
    assert.notEqual(tokens["--sidebar"], tokens["--primary"]);
    assert.ok(tokens["--sidebar-gradient-end"]);
    assert.equal(tokens["--sidebar-foreground"], "0 0% 100%");
  });

  it("keeps a distinct active chip token for dark primary sidebars", () => {
    const tokens = buildBrandThemeCssVariables(
      {
        primary: "#FF0000",
        sidebar: "#005747",
        sidebarActive: "#00E6CB",
        sidebarAccent: "#0F766E",
      },
      "light",
    );

    assert.notEqual(tokens["--sidebar-primary"], tokens["--sidebar"]);
    assert.notEqual(tokens["--sidebar-primary"], tokens["--primary"]);
  });

  it("falls back sidebar slots from legacy primary/secondary/accent when omitted", () => {
    const tokens = buildBrandThemeCssVariables(
      {
        primary: "#005747",
        secondary: "#134E4A",
        accent: "#00E6CB",
      },
      "light",
    );

    // Defaults fill missing sidebar* — still independent from page bg.
    assert.ok(tokens["--sidebar"]);
    assert.notEqual(tokens["--sidebar"], tokens["--background"]);
  });
});
