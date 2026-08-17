import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SETTINGS_ROUTE_REGISTRY,
  settingsNavItems,
} from "../src/config/settings-route-registry.ts";
import {
  isSelfServiceSettingsRoute,
  isSettingsRoutePermitted,
} from "../src/lib/settings/settings-permissions.ts";

const PERSONAL_IDS = [
  "personal-profile",
  "appearance",
  "account-information",
  "security",
  "notifications",
] as const;

const COMMERCIAL_BY_ID: Record<string, string> = {
  email: "email_channel",
  whatsapp: "whatsapp_channel",
  messenger: "facebook_channel",
  instagram: "instagram_channel",
  calendar: "bookings",
  scheduling: "bookings",
  "ticket-sla": "ticketing",
};

function perms(...codes: string[]) {
  const set = new Set(codes);
  return (code: string) => set.has(code);
}

function entitled(...codes: string[]) {
  const set = new Set(codes);
  return (code: string) => set.has(code);
}

describe("Settings visibility — personal / RBAC / commercial", () => {
  it("maps commercial settings to existing billing feature codes only", () => {
    for (const [id, code] of Object.entries(COMMERCIAL_BY_ID)) {
      const route = SETTINGS_ROUTE_REGISTRY.find((item) => item.id === id);
      assert.ok(route, id);
      assert.equal(route.commercialFeatureCode, code);
    }
    assert.equal(
      SETTINGS_ROUTE_REGISTRY.find((item) => item.id === "platform-ai")?.superAdminOnly,
      true,
    );
  });

  it("keeps personal settings self-service (no commercial gate)", () => {
    for (const id of PERSONAL_IDS) {
      assert.equal(isSelfServiceSettingsRoute(id), true);
      const route = SETTINGS_ROUTE_REGISTRY.find((item) => item.id === id);
      assert.ok(route);
      assert.equal(route.commercialFeatureCode, undefined);
      assert.equal(
        isSettingsRoutePermitted(route, () => false, false, () => false),
        true,
      );
    }
  });

  it("A — trial entitlements: only entitled commercial settings visible to company admin", () => {
    const hasPermission = perms(
      "settings.view",
      "settings.edit",
      "bookings.view",
      "scheduling.view",
      "tickets.manage",
    );
    const trial = entitled("ticketing", "basic_reports", "bookings", "customers", "core_crm");
    const ids = settingsNavItems(hasPermission, false, trial).map((r) => r.id);

    for (const id of PERSONAL_IDS) assert.ok(ids.includes(id), id);
    assert.ok(ids.includes("calendar"));
    assert.ok(ids.includes("scheduling"));
    assert.ok(ids.includes("ticket-sla"));
    assert.equal(ids.includes("email"), false);
    assert.equal(ids.includes("whatsapp"), false);
    assert.equal(ids.includes("messenger"), false);
    assert.equal(ids.includes("instagram"), false);
    assert.equal(ids.includes("platform-ai"), false);
  });

  it("B — without email entitlement: Email Settings hidden and route denied", () => {
    const route = SETTINGS_ROUTE_REGISTRY.find((item) => item.id === "email")!;
    const hasPermission = perms("settings.view", "settings.edit");
    const noEmail = entitled("whatsapp_channel");

    assert.equal(isSettingsRoutePermitted(route, hasPermission, false, noEmail), false);
    assert.equal(
      settingsNavItems(hasPermission, false, noEmail).some((r) => r.id === "email"),
      false,
    );
  });

  it("C — with email entitlement: authorized user allowed, unauthorized denied", () => {
    const route = SETTINGS_ROUTE_REGISTRY.find((item) => item.id === "email")!;
    const withEmail = entitled("email_channel");

    assert.equal(
      isSettingsRoutePermitted(route, perms("settings.view", "settings.edit"), false, withEmail),
      true,
    );
    assert.equal(
      isSettingsRoutePermitted(route, perms("settings.view"), false, withEmail),
      false,
    );
    assert.equal(
      isSettingsRoutePermitted(route, () => false, false, withEmail),
      false,
    );
  });

  it("D — Company Admin configures entitled features but commercial codes stay grant-gated", () => {
    const hasPermission = perms("settings.view", "settings.edit");
    // Entitled WhatsApp only — cannot access Email Settings (no self-grant via UI).
    assert.equal(
      isSettingsRoutePermitted(
        SETTINGS_ROUTE_REGISTRY.find((r) => r.id === "whatsapp")!,
        hasPermission,
        false,
        entitled("whatsapp_channel"),
      ),
      true,
    );
    assert.equal(
      isSettingsRoutePermitted(
        SETTINGS_ROUTE_REGISTRY.find((r) => r.id === "email")!,
        hasPermission,
        false,
        entitled("whatsapp_channel"),
      ),
      false,
    );
  });

  it("E — Employee without company settings permission cannot open commercial settings", () => {
    const employee = perms(); // no settings.view / settings.edit
    const allCommercial = entitled(
      "email_channel",
      "whatsapp_channel",
      "facebook_channel",
      "instagram_channel",
      "bookings",
      "ticketing",
    );
    const ids = settingsNavItems(employee, false, allCommercial).map((r) => r.id);
    for (const id of PERSONAL_IDS) assert.ok(ids.includes(id));
    assert.equal(ids.includes("email"), false);
    assert.equal(ids.includes("whatsapp"), false);
    assert.equal(ids.includes("ticket-sla"), false);
  });

  it("F — Super Admin retains platform-ai and commercial settings access", () => {
    const none = () => false;
    assert.equal(
      isSettingsRoutePermitted(
        SETTINGS_ROUTE_REGISTRY.find((r) => r.id === "platform-ai")!,
        none,
        true,
        none,
      ),
      true,
    );
    assert.equal(
      isSettingsRoutePermitted(
        SETTINGS_ROUTE_REGISTRY.find((r) => r.id === "email")!,
        none,
        true,
        () => false,
      ),
      true,
    );
  });

  it("G — commercial lookup fail-closed (missing / loading undefined denies)", () => {
    const route = SETTINGS_ROUTE_REGISTRY.find((item) => item.id === "email")!;
    const hasPermission = perms("settings.view", "settings.edit");
    assert.equal(isSettingsRoutePermitted(route, hasPermission, false, undefined), false);
    assert.equal(
      isSettingsRoutePermitted(route, hasPermission, false, () => undefined),
      false,
    );
  });

  it("H — personal settings remain reachable regardless of entitlements", () => {
    const ids = settingsNavItems(() => false, false, () => false).map((r) => r.id);
    assert.deepEqual(
      ids.filter((id) => (PERSONAL_IDS as readonly string[]).includes(id)),
      [...PERSONAL_IDS],
    );
  });
});
