import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_BRAND_COLORS } from "../company-workspace/brand-center/defaults.ts";
import {
  ORIGINAL_LIGHT_SIDEBAR_CSS,
  buildBrandThemeCssVariables,
} from "./brand-theme-service.ts";

describe("buildBrandThemeCssVariables sidebar chrome", () => {
  it("does not paint light-mode sidebar from Brand Center / company teal", () => {
    const tokens = buildBrandThemeCssVariables(
      {
        primary: "#FF0000",
        secondary: "#9BD2B2",
        accent: "#00E6CB",
        background: "#FFFFFF",
        surface: "#FFFFFF",
        sidebar: "#134E4A",
        sidebarActive: "#0D9488",
        sidebarAccent: "#0F766E",
      },
      "light",
    );

    assert.equal(tokens["--sidebar"], undefined);
    assert.equal(tokens["--sidebar-background"], undefined);
    assert.equal(tokens["--sidebar-foreground"], undefined);
    assert.equal(tokens["--sidebar-gradient-end"], undefined);
    assert.equal(tokens["--sidebar-primary"], undefined);
    assert.equal(tokens["--sidebar-accent"], undefined);
    assert.equal(tokens["--sidebar-border"], undefined);
    // Non-sidebar brand tokens still apply.
    assert.ok(tokens["--primary"]);
    assert.notEqual(tokens["--primary"], ORIGINAL_LIGHT_SIDEBAR_CSS["--sidebar"]);
  });

  it("does not paint dark-mode sidebar from Brand Center either", () => {
    const tokens = buildBrandThemeCssVariables(DEFAULT_BRAND_COLORS, "dark");
    assert.equal(tokens["--sidebar"], undefined);
    assert.equal(tokens["--sidebar-primary"], undefined);
    assert.ok(tokens["--primary"]);
  });

  it("keeps original light gray sidebar tokens distinct from ValueOR teal #134E4A", () => {
    assert.equal(ORIGINAL_LIGHT_SIDEBAR_CSS["--sidebar"], "210 25% 96%");
    assert.equal(ORIGINAL_LIGHT_SIDEBAR_CSS["--sidebar-foreground"], "222 35% 18%");
    assert.equal(ORIGINAL_LIGHT_SIDEBAR_CSS["--sidebar-accent"], "210 20% 93%");
    assert.equal(ORIGINAL_LIGHT_SIDEBAR_CSS["--sidebar-gradient-end"], "210 20% 92%");
    // Teal brand sidebar must not equal the restored gray rail.
    assert.notEqual(ORIGINAL_LIGHT_SIDEBAR_CSS["--sidebar"], "176 61% 19%");
  });

  it("role/RBAC is not consulted by brand token builder (pure colors → CSS map)", () => {
    const a = buildBrandThemeCssVariables(DEFAULT_BRAND_COLORS, "light");
    const b = buildBrandThemeCssVariables(
      { ...DEFAULT_BRAND_COLORS, sidebar: "#005747" },
      "light",
    );
    assert.equal(a["--sidebar"], b["--sidebar"]);
    assert.equal(a["--sidebar"], undefined);
  });
});
