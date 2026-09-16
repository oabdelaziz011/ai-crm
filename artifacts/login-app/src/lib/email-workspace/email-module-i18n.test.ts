/**
 * Email module i18n consistency — every emailModule.* key used in source
 * must resolve to a human string in both EN and AR common locale.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const loginAppSrc = join(here, "../..");

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (/\.(tsx?|jsx?)$/.test(name)) acc.push(p);
  }
  return acc;
}

function extractEmailModuleKeys(source: string): Set<string> {
  const keys = new Set<string>();
  const patterns = [/t\(\s*["']([^"']+)["']/g, /t\(\s*`([^`]+)`/g];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(source))) {
      const raw = m[1];
      if (!raw.startsWith("emailModule.")) continue;
      keys.add(raw.replace(/\$\{[^}]+\}/g, "*"));
    }
  }
  return keys;
}

function hasKey(obj: unknown, dotted: string): boolean {
  const parts = dotted.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (p === "*") return typeof cur === "object" && cur !== null;
    if (cur == null || typeof cur !== "object" || !(p in (cur as object))) return false;
    cur = (cur as Record<string, unknown>)[p];
  }
  return typeof cur === "string" || (typeof cur === "object" && cur !== null);
}

function leafValue(obj: unknown, dotted: string): unknown {
  const parts = dotted.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (p === "*" || cur == null || typeof cur !== "object") return cur;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function assertHuman(value: unknown, path: string) {
  assert.equal(typeof value, "string", `${path} must be string`);
  const text = String(value).trim();
  assert.ok(text.length > 0, `${path} empty`);
  assert.doesNotMatch(
    text,
    /^(emailModule|notifications|companyWorkspace)\./,
    `${path} looks like a raw key: ${text}`,
  );
}

describe("email module i18n consistency", () => {
  const roots = [
    join(loginAppSrc, "components/email"),
    join(loginAppSrc, "pages/dashboard"),
    join(loginAppSrc, "lib/email-workspace"),
  ];
  const files = roots.flatMap((r) => walk(r));
  const keys = new Set<string>();
  for (const f of files) {
    for (const k of extractEmailModuleKeys(readFileSync(f, "utf8"))) keys.add(k);
  }

  const en = JSON.parse(readFileSync(join(loginAppSrc, "locales/en/common.json"), "utf8"));
  const ar = JSON.parse(readFileSync(join(loginAppSrc, "locales/ar/common.json"), "utf8"));

  it("collects emailModule translation usages from Email surfaces", () => {
    assert.ok(keys.size > 50, `expected many emailModule keys, got ${keys.size}`);
  });

  it("every used emailModule key exists in EN and AR", () => {
    const missingEn: string[] = [];
    const missingAr: string[] = [];
    for (const k of [...keys].sort()) {
      if (!hasKey(en, k)) missingEn.push(k);
      if (!hasKey(ar, k)) missingAr.push(k);
    }
    assert.deepEqual(missingEn, [], `missing EN keys:\n${missingEn.join("\n")}`);
    assert.deepEqual(missingAr, [], `missing AR keys:\n${missingAr.join("\n")}`);
  });

  it("critical Email Workspace / Control Center strings are human-readable", () => {
    const critical = [
      "emailModule.workspace.title",
      "emailModule.workspace.subtitle",
      "emailModule.workspace.searchPlaceholder",
      "emailModule.workspace.noCustomer",
      "emailModule.workspace.noTicket",
      "emailModule.workspace.hasDraft",
      "emailModule.setup.cta",
      "emailModule.howItWorks.title",
      "emailModule.howItWorks.caption",
      "emailModule.howItWorks.steps.receive",
      "emailModule.howItWorks.steps.copilot",
      "emailModule.controlCenter.cards.routing",
      "emailModule.metrics.incoming",
      "emailModule.metrics.ticketsCreated",
      "emailModule.connect.title",
      "emailModule.settingsHub.tabs.connection",
      "emailModule.settingsHub.tabs.identity",
    ];
    for (const k of critical) {
      assertHuman(leafValue(en, k), `en.${k}`);
      assertHuman(leafValue(ar, k), `ar.${k}`);
    }
    assert.equal(en.emailModule.settingsHub.tabs.connection, "Connection");
    assert.equal(ar.emailModule.settingsHub.tabs.connection, "الاتصال");
    assert.equal(Object.keys(en.emailModule.settingsHub.tabs).length, 2);
    assert.equal(Object.keys(ar.emailModule.settingsHub.tabs).length, 2);
  });

  it("keeps brandCenter.replyEmail as canonical Reply-To label", () => {
    assertHuman(en.companyWorkspace.brandCenter.replyEmail, "en.replyEmail");
    assertHuman(ar.companyWorkspace.brandCenter.replyEmail, "ar.replyEmail");
    assert.equal(en.companyWorkspace.brandCenter.emailStudio?.replyEmail, undefined);
    assert.equal(ar.companyWorkspace.brandCenter.emailStudio?.replyEmail, undefined);
  });
});
