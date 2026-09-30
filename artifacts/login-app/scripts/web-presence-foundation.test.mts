/**
 * Web Presence Phase 0 + 1 — source contracts (migrations 397–399, maps); Phase 2 (400) limits
 * public exposure to the gated Public Web Chat backend.
 * Live RLS coverage: node --test scripts/web-presence-foundation-rls.test.mjs (repo root, local DB).
 * Run: npx tsx --test scripts/web-presence-foundation.test.mts
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  BILLING_FEATURE_CODES,
  resolveChannelCommercialFeatureCode,
} from "../src/lib/billing/feature-code-map.ts";
import {
  WEB_WIDGET_CHANNEL_PROVIDER,
  selectInternalWebChatChannel,
} from "../src/lib/channels/internal-web-chat-channel.ts";
import { overlayPermissionModuleId, resolvePermissionFamilyId } from "../src/lib/rbac/permission-module-taxonomy.ts";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "../../..");
const read = (rel: string) => readFileSync(resolve(projectRoot, rel), "utf8");

const m397 = read("supabase/migrations/397_portal_public_rpc_hardening.sql");
const m398 = read("supabase/migrations/398_web_presence_entitlements.sql");
const m399 = read("supabase/migrations/399_web_presence_data_foundation.sql");
const newMigrations = [m397, m398, m399].join("\n");

const NEW_TABLES = ["web_presence_pages", "web_chat_widgets", "web_chat_visitor_sessions"] as const;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

describe("Migration numbering", () => {
  it("397–402 are the latest migrations and unique", () => {
    const files = readdirSync(resolve(projectRoot, "supabase/migrations")).filter((f) => /^\d{3}_/.test(f));
    const numbers = files.map((f) => Number(f.slice(0, 3)));
    assert.equal(Math.max(...numbers), 402);
    for (const n of [397, 398, 399, 400, 401, 402]) {
      assert.equal(numbers.filter((x) => x === n).length, 1, String(n));
    }
  });
});

describe("1. Feature definitions", () => {
  it("adds exactly web_presence_page + web_chat_widget (flags + billing map)", () => {
    for (const code of ["web_presence_page", "web_chat_widget"]) {
      assert.match(m398, new RegExp(`'${code}'`));
      assert.ok((BILLING_FEATURE_CODES as readonly string[]).includes(code), code);
    }
    assert.match(m398, /insert into public\.feature_flags/);
    assert.match(m398, /insert into public\.feature_definitions/);
  });

  it("grants no company entitlement", () => {
    assert.doesNotMatch(newMigrations, /insert into public\.(plan_features|company_feature_overrides)/i);
    assert.doesNotMatch(newMigrations, /company_subscriptions/i);
  });
});

describe("2. Permission mappings", () => {
  it("maps web_presence.view/manage to both features and role templates", () => {
    for (const feature of ["web_presence_page", "web_chat_widget"]) {
      for (const perm of ["web_presence.view", "web_presence.manage"]) {
        assert.match(m398, new RegExp(`\\('${feature}', '${perm.replace(".", "\\.")}'\\)`));
      }
    }
    assert.match(m398, /\('admin', 'web_presence\.manage'\)/);
    assert.match(m398, /\('manager', 'web_presence\.view'\)/);
  });

  it("catalog labels exist in EN/AR under the webPresence group", () => {
    for (const locale of ["en", "ar"]) {
      const catalog = JSON.parse(read(`artifacts/login-app/src/locales/${locale}/permission-catalog.json`)) as {
        groups: Record<string, { label: string }>;
        codes: Record<string, { name: string; group: string }>;
      };
      assert.ok(catalog.groups.webPresence?.label, locale);
      for (const code of ["web_presence.view", "web_presence.manage"]) {
        assert.equal(catalog.codes[code]?.group, "webPresence", `${locale} ${code}`);
      }
    }
    assert.equal(overlayPermissionModuleId("web_presence.view"), null);
    assert.equal(resolvePermissionFamilyId("webPresence"), "company");
  });
});

describe("web_chat stays non-commercial", () => {
  it("no commercial mapping for the generic web_chat key anywhere", () => {
    assert.equal(resolveChannelCommercialFeatureCode("web_chat"), null);
    assert.doesNotMatch(newMigrations, /create or replace function internal\.resolve_channel_commercial_feature_code/);
    assert.doesNotMatch(newMigrations, /create or replace function internal\.is_noncommercial_channel_catalog_key/);
    for (const rel of [
      "artifacts/api-server/src/lib/require-company-feature.ts",
      "lib/channel-platform/src/ports/channel-commercial-entitlement-port.ts",
    ]) {
      const src = read(rel);
      assert.doesNotMatch(src, /web_chat_widget|web_presence_page/, rel);
      assert.doesNotMatch(src, /web_chat:\s*"/, rel);
    }
  });
});

describe("3–4, 9. RLS shape (staff-only, company isolation, suspended lock)", () => {
  for (const table of NEW_TABLES) {
    it(`${table}: RLS on, anon revoked, suspended lock policy`, () => {
      assert.match(m399, new RegExp(`alter table public\\.${table} enable row level security`));
      assert.match(m399, new RegExp(`revoke all on public\\.${table} from public, anon, authenticated`));
      assert.match(
        m399,
        new RegExp(
          `create policy rls_workspace_lock_suspended_${table} on public\\.${table}\\s+as restrictive for all to authenticated\\s+using \\(public\\.company_workspace_unlocked\\(company_id\\)\\)\\s+with check \\(public\\.company_workspace_unlocked\\(company_id\\)\\)`,
        ),
      );
      assert.match(m399, new RegExp(`${table}[\\s\\S]*company_id uuid not null references public\\.companies`));
    });
  }

  it("no anon grants in the data/entitlement migrations", () => {
    assert.doesNotMatch(m398, /to anon/i);
    assert.doesNotMatch(m399, /grant [^;]* to [^;]*\banon\b/i);
  });

  it("staff gate = tenant + RBAC + table feature", () => {
    assert.match(m399, /internal\.company_has_permission\(p_company_id, 'web_presence\.manage'\)/);
    assert.match(m399, /public\.is_feature_enabled\(p_company_id, p_feature_code\)/);
    assert.match(m399, /web_presence_access\(company_id, 'web_presence_page', true\)/);
    assert.match(m399, /web_presence_access\(company_id, 'web_chat_widget', false\)/);
  });
});

describe("5–8. Widget + session invariants", () => {
  it("public_key random, unique, server-generated", () => {
    assert.match(m399, /gen_random_bytes\(24\)/);
    assert.match(m399, /create unique index if not exists idx_web_chat_widgets_public_key/);
    assert.match(m399, /new\.public_key := internal\.web_chat_generate_public_key\(\)/);
  });

  it("widget channel must be the same company's dedicated valueor.web_widget row", () => {
    assert.match(m399, /Widget channel must belong to the same company/);
    assert.match(m399, /v_channel_provider is distinct from 'valueor\.web_widget'/);
  });

  it("AI Employee must be same company", () => {
    assert.match(m399, /AI Employee must belong to the same company/);
  });

  it("token stored as SHA-256 hash only", () => {
    assert.match(m399, /token_hash text not null/);
    assert.match(m399, /check \(token_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/);
    assert.doesNotMatch(m399, /\btoken text\b/);
    assert.match(m399, /revoke all on function internal\.web_chat_visitor_token_hash\(text\) from public, anon, authenticated/);
  });
});

describe("10. Internal AI chat unaffected", () => {
  it("selector never picks a widget channel, preserves default preference", () => {
    const generic = { id: "g", provider: "generic.web_chat", is_default: false };
    const genericDefault = { id: "gd", provider: "generic.web_chat", is_default: true };
    const widget = { id: "w", provider: WEB_WIDGET_CHANNEL_PROVIDER, is_default: true };
    assert.equal(selectInternalWebChatChannel([widget]), null);
    assert.equal(selectInternalWebChatChannel([widget, generic])?.id, "g");
    assert.equal(selectInternalWebChatChannel([generic, genericDefault])?.id, "gd");
    assert.equal(selectInternalWebChatChannel([]), null);
  });

  it("the internal AI chat hook uses the selector", () => {
    const hook = read("artifacts/login-app/src/hooks/ai-chat/use-web-chat-company-channel.ts");
    assert.match(hook, /selectInternalWebChatChannel\(channels\)/);
    assert.match(hook, /channelKey: "web_chat"/);
  });

  it("widget channel rows are never default; provisioned disabled; activation follows widget.enabled (400)", () => {
    const m400 = read("supabase/migrations/400_web_chat_public_backend.sql");
    assert.match(m399, /Web widget channel cannot be the default company channel/);
    assert.match(m399, /'pending',\s*'valueor\.web_widget'/);
    assert.match(m400, /Web widget channel cannot be the default company channel/);
    assert.doesNotMatch(m400, /Web widget channel activation is not available/);
    assert.match(m400, /create trigger web_chat_widgets_sync_channel_state/);
  });
});

describe("Public exposure limited to the gated Phase 2 backend", () => {
  it("no api-server or login-app runtime code references the new tables/RPCs", () => {
    const roots = ["artifacts/api-server/src", "artifacts/login-app/src"].map((r) => resolve(projectRoot, r));
    const offenders: string[] = [];
    for (const root of roots) {
      for (const file of walk(root)) {
        const src = readFileSync(file, "utf8");
        if (/web_chat_widgets|web_presence_pages|web_chat_visitor_sessions|web_presence_provision_widget/.test(src)) {
          offenders.push(file);
        }
      }
    }
    assert.deepEqual(offenders, []);
  });

  it("only the Public Web Chat router is mounted publicly; authenticated router and SPA unchanged", () => {
    const app = read("artifacts/api-server/src/app.ts");
    const routes = read("artifacts/api-server/src/routes/index.ts");
    assert.doesNotMatch(routes, /web[-_]?chat|web[-_]?presence|widget/i);
    assert.match(app, /app\.use\(PUBLIC_WEB_CHAT_ROUTE_PREFIX, publicWebChatRouter\)/);
    const withoutPublicChat = app
      .split(/\r?\n/)
      .filter((line) => !/public-web-chat|PUBLIC_WEB_CHAT_ROUTE_PREFIX|publicWebChatRouter|Public Web Chat/.test(line))
      .join("\n");
    assert.doesNotMatch(withoutPublicChat, /web[-_]?chat|web[-_]?presence|widget/i);
    assert.equal(existsSync(resolve(projectRoot, "artifacts/api-server/src/routes/public-web-chat.ts")), true);
    assert.doesNotMatch(read("artifacts/login-app/src/App.tsx"), /web[-_]?presence|business[-_]?page/i);
  });
});

describe("11. Email / SMS / Meta untouched", () => {
  it("new migrations do not touch Meta, Email or SMS tables or providers", () => {
    assert.doesNotMatch(
      newMigrations,
      /company_(whatsapp|email|messenger|instagram|sms)_settings|graph\.facebook|notification_queue|webhook_url\s*=/i,
    );
  });
});

describe("Phase 0 security (397)", () => {
  it("S1: untrusted callers gated on enabled + unlocked portal; owner validated; no identity rewrite", () => {
    assert.match(m397, /if not v_trusted and not internal\.portal_company_publicly_available\(p_company_id\)/);
    assert.match(m397, /and p\.company_id = p_company_id\s+and coalesce\(p\.is_active, true\) = true/);
    assert.match(m397, /nullif\(btrim\(coalesce\(email, ''\)\), ''\) is null/);
  });

  it("S2: no anon execute, no owner_user_id leak", () => {
    assert.match(m397, /revoke all on function public\.portal_resolve_customer_by_phone\(uuid, text\) from anon/);
    const s2Body = m397.slice(m397.indexOf("create or replace function public.portal_resolve_customer_by_phone"));
    assert.doesNotMatch(s2Body, /'owner_user_id'/);
  });

  it("S6: public read requires non-suspended company", () => {
    assert.match(
      m397,
      /create policy portal_settings_public_read on public\.customer_portal_settings for select\s+using \(enabled = true and internal\.company_publicly_unlocked\(company_id\)\)/,
    );
  });
});
