/**
 * Renders route-registry nav labels in Arabic and asserts DOM text (visual parity check).
 * Run: npm run test:nav-i18n
 */
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { I18nextProvider, useTranslation } from "react-i18next";
import i18n from "../src/i18n";
import { BILLING_ROUTE_REGISTRY } from "../src/config/billing-route-registry";
import { WORKSPACE_ROUTE_REGISTRY } from "../src/config/workspace-route-registry";
import { translateRouteTitle } from "../src/lib/i18n/translate-route-title";

const BILLING_AR: Record<string, string> = {
  overview: "نظرة عامة",
  payments: "المدفوعات",
  invoices: "فواتير الاشتراك",
  receipts: "الإيصالات",
  failures: "فشل المدفوعات",
  renewals: "التجديدات",
  expirations: "انتهاء الصلاحية",
  revenue: "الإيرادات",
  analytics: "التحليلات",
  "provider-health": "صحة مزود الدفع",
  settings: "إعدادات الفوترة",
  audit: "سجل تدقيق الفوترة",
};

const WORKSPACE_AR: Record<string, string> = {
  overview: "نظرة عامة",
  usage: "الاستخدام",
  billing: "الفوترة",
};

const win = new Window({ url: "http://localhost/" });
(globalThis as { window?: Window; document?: Document }).window = win;
(globalThis as { window?: Window; document?: Document }).document = win.document;

function NavLabelsProbe({
  items,
  prefix,
}: {
  items: readonly { id: string; titleKey: string }[];
  prefix: string;
}) {
  const { t, i18n: inst } = useTranslation("common");
  return React.createElement(
    "div",
    { id: `${prefix}-nav-labels`, "data-lang": inst.language },
    items.map((item) =>
      React.createElement(
        "span",
        { key: `${item.id}-${inst.language}`, id: `${prefix}-${item.id}` },
        translateRouteTitle(t, item.titleKey),
      ),
    ),
  );
}

const rootEl = win.document.createElement("div");
win.document.body.appendChild(rootEl);
const root = createRoot(rootEl);

await i18n.changeLanguage("ar");

await act(async () => {
  root.render(
    React.createElement(
      I18nextProvider,
      { i18n },
      React.createElement(
        "div",
        null,
        React.createElement(NavLabelsProbe, { items: BILLING_ROUTE_REGISTRY, prefix: "billing" }),
        React.createElement(NavLabelsProbe, { items: WORKSPACE_ROUTE_REGISTRY, prefix: "workspace" }),
      ),
    ),
  );
});
await act(async () => new Promise((r) => setTimeout(r, 30)));

console.log("\nArabic nav DOM verification\n");

for (const route of BILLING_ROUTE_REGISTRY) {
  const el = win.document.getElementById(`billing-${route.id}`);
  const text = el?.textContent ?? "";
  const expected = BILLING_AR[route.id];
  assert.equal(text, expected, `billing/${route.id}: DOM "${text}" !== "${expected}"`);
  console.log(`  ✓ billing/${route.id}: ${text}`);
}

for (const route of WORKSPACE_ROUTE_REGISTRY) {
  const el = win.document.getElementById(`workspace-${route.id}`);
  const text = el?.textContent ?? "";
  const expected = WORKSPACE_AR[route.id];
  assert.equal(text, expected, `workspace/${route.id}: DOM "${text}" !== "${expected}"`);
  console.log(`  ✓ workspace/${route.id}: ${text}`);
}

assert.equal(win.document.getElementById("billing-nav-labels")?.getAttribute("data-lang"), "ar");
console.log("\n✓ All billing and workspace navigation labels render in Arabic in the DOM.\n");
