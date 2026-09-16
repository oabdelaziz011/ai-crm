import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { EMAIL_ROUTE_REGISTRY, emailNavItems } from "../src/config/email-route-registry.ts";
import { SETTINGS_ROUTE_REGISTRY } from "../src/config/settings-route-registry.ts";
import { isEmailNavRouteVisible } from "../src/lib/email-routing/email-nav-visibility.ts";
import { isSettingsRoutePermitted } from "../src/lib/settings/settings-permissions.ts";
import {
  EMAIL_ROUTING_TAB_PERMISSION,
  EMAIL_SETTINGS_TAB_PERMISSION,
  EMAIL_TEMPLATES_TAB_PERMISSION,
} from "../src/lib/email-workspace/email-tab-permissions.ts";

const here = dirname(fileURLToPath(import.meta.url));
const entitled = () => true;

describe("Email Workspace tab RBAC (Templates / AI Routing / Settings)", () => {
  it("reuses ai.email.manage for Settings and adds two Email-namespace tab codes", () => {
    assert.equal(EMAIL_TEMPLATES_TAB_PERMISSION, "email.templates.view");
    assert.equal(EMAIL_ROUTING_TAB_PERMISSION, "email.routing.view");
    assert.equal(EMAIL_SETTINGS_TAB_PERMISSION, "ai.email.manage");
  });

  it("does not attach tab permissions to Incoming / Sent / Pending", () => {
    const inbox = EMAIL_ROUTE_REGISTRY.find((route) => route.id === "inbox");
    const sent = EMAIL_ROUTE_REGISTRY.find((route) => route.id === "sent");
    const drafts = EMAIL_ROUTE_REGISTRY.find((route) => route.id === "drafts");
    assert.equal(inbox?.permission, undefined);
    assert.equal(sent?.permission, undefined);
    assert.equal(drafts?.permission, undefined);
    const visible = emailNavItems(entitled, { hasPermission: () => false });
    assert.deepEqual(
      visible.map((route) => route.id),
      ["inbox", "sent", "drafts"],
    );
  });

  it("TEST 1/2 — Templates tab hidden without permission, visible with it", () => {
    const route = EMAIL_ROUTE_REGISTRY.find((item) => item.id === "templates")!;
    assert.equal(route.permission, EMAIL_TEMPLATES_TAB_PERMISSION);
    assert.equal(
      isEmailNavRouteVisible(route, entitled, { hasPermission: () => false }),
      false,
    );
    assert.equal(
      isEmailNavRouteVisible(route, entitled, {
        hasPermission: (code) => code === EMAIL_TEMPLATES_TAB_PERMISSION,
      }),
      true,
    );
  });

  it("TEST 3/4 — AI Routing requires its own permission, not email.view or conversation codes", () => {
    const route = EMAIL_ROUTE_REGISTRY.find((item) => item.id === "ai-routing")!;
    const conversationOnly = (code: string) =>
      code === "email.view" ||
      code === "ai.conversations.view" ||
      code === "ai.conversations.view_assigned" ||
      code === "ai.conversations.reply";
    assert.equal(
      isEmailNavRouteVisible(route, entitled, { hasPermission: conversationOnly }),
      false,
    );
    assert.equal(
      isEmailNavRouteVisible(route, entitled, {
        hasPermission: (code) => code === EMAIL_ROUTING_TAB_PERMISSION,
      }),
      true,
    );
  });

  it("TEST 5/6 — Settings uses ai.email.manage, not settings.view/edit", () => {
    const route = SETTINGS_ROUTE_REGISTRY.find((item) => item.id === "email")!;
    assert.equal(
      isSettingsRoutePermitted(route, (code) => code === "settings.edit", false, entitled),
      false,
    );
    assert.equal(
      isSettingsRoutePermitted(
        route,
        (code) => code === EMAIL_SETTINGS_TAB_PERMISSION,
        false,
        entitled,
      ),
      true,
    );
  });

  it("TEST 7 — mixed grants show only corresponding Email tabs", () => {
    const hasPermission = (code: string) => code === EMAIL_TEMPLATES_TAB_PERMISSION;
    const ids = emailNavItems(entitled, { hasPermission }).map((route) => route.id);
    assert.ok(ids.includes("templates"));
    assert.equal(ids.includes("ai-routing"), false);
    assert.ok(ids.includes("inbox"));
    assert.ok(ids.includes("sent"));
    assert.ok(ids.includes("drafts"));
  });

  it("TEST 8 — Super Admin sees all three tabs even without explicit grants", () => {
    const ids = emailNavItems(() => false, { hasPermission: () => false, isSuperAdmin: true }).map(
      (route) => route.id,
    );
    assert.ok(ids.includes("templates"));
    assert.ok(ids.includes("ai-routing"));
    const settings = SETTINGS_ROUTE_REGISTRY.find((item) => item.id === "email")!;
    assert.equal(isSettingsRoutePermitted(settings, () => false, true, () => false), true);
  });

  it("Email SubNav hides Settings unless Super Admin or Email Settings access + email_channel", () => {
    const nav = readFileSync(resolve(here, "../src/components/email/layout/email-sub-nav.tsx"), "utf8");
    assert.match(nav, /canAccessEmailSettingsPage/);
    assert.match(nav, /email_channel/);
    const guard = readFileSync(resolve(here, "../src/components/email/layout/email-route-guard.tsx"), "utf8");
    assert.match(guard, /route\.permission/);
    assert.match(guard, /isSuperAdmin/);
  });
});
