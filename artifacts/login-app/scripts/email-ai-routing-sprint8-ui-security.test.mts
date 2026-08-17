import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, it } from "node:test";
import { EMAIL_ROUTE_REGISTRY } from "../src/config/email-route-registry.ts";
import { SETTINGS_ROUTE_REGISTRY } from "../src/config/settings-route-registry.ts";
import { isEmailNavRouteVisible } from "../src/lib/email-routing/email-nav-visibility.ts";

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      walk(full, out);
    } else if (/\.(ts|tsx|mts|js|mjs)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

describe("Sprint 8 Email UI + security smoke", () => {
  it("Email module has agreed sub-routes including AI Routing (SMTP settings live in system Settings)", () => {
    const ids = EMAIL_ROUTE_REGISTRY.map((route) => route.id);
    assert.deepEqual(ids, ["inbox", "sent", "drafts", "templates", "ai-routing"]);
    assert.equal(
      EMAIL_ROUTE_REGISTRY.some((route) => route.id === "settings"),
      false,
    );
  });

  it("AI Routing nav requires ai_email_routing entitlement", () => {
    const route = EMAIL_ROUTE_REGISTRY.find((item) => item.id === "ai-routing");
    assert.equal(route?.commercialFeatureCode, "ai_email_routing");
    assert.equal(route?.permission, "settings.view");
    assert.equal(isEmailNavRouteVisible(route!, () => false), false);
    assert.equal(isEmailNavRouteVisible(route!, () => true), true);
  });

  it("SMTP email settings remain under system Settings with settings.edit + email_channel", () => {
    const settingsEmail = SETTINGS_ROUTE_REGISTRY.find((item) => item.id === "email");
    assert.equal(settingsEmail?.nestedPath, "/email");
    assert.equal(settingsEmail?.permission, "settings.edit");
    assert.equal(settingsEmail?.commercialFeatureCode, "email_channel");
  });

  it("email-routing frontend sources do not embed service-role or provider API keys", () => {
    const roots = [
      resolve("src/lib/email-routing"),
      resolve("src/pages/dashboard/email"),
      resolve("src/components/email"),
      resolve("src/hooks/email"),
    ];
    const files = roots.flatMap((root) => {
      try {
        return walk(root);
      } catch {
        return [];
      }
    });
    assert.ok(files.length > 0, "expected email routing frontend files");

    const forbidden = [
      /service_role/i,
      /SERVICE_ROLE/,
      /sk-[a-zA-Z0-9]{10,}/,
      /SUPABASE_SERVICE_ROLE_KEY/,
      /openai.*api[_-]?key/i,
    ];

    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const pattern of forbidden) {
        assert.equal(pattern.test(text), false, `${file} matched ${pattern}`);
      }
    }
  });
});
