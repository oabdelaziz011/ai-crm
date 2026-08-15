/**
 * Nested routing regression tests — billing, workspace, dashboard.
 * Run: npm run test:routing
 */
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { Link, Route, Router, Switch, useLocation, useRoute } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { BILLING_ROUTE_REGISTRY } from "../src/config/billing-route-registry";
import { DASHBOARD_ROUTE_REGISTRY } from "../src/config/dashboard-route-registry";
import { WORKSPACE_ROUTE_REGISTRY } from "../src/config/workspace-route-registry";
import {
  assertNoDuplicateAdjacentSegments,
  billingDetailHref,
  nestedSectionHref,
  toDashboardAbsolutePath,
} from "../src/lib/routing/nested-paths";
import { isUuidSegment } from "../src/lib/billing/subscription-status-display";

const DEMO_COMPANY_ID = "d0000010-0001-4001-8001-000000000002";

type Harness = {
  hook: ReturnType<typeof memoryLocation>["hook"];
  navigate: ReturnType<typeof memoryLocation>["navigate"];
  history: string[];
  root: Root;
  rootEl: HTMLElement;
  win: Window;
};

function setupHarness(initialPath: string): Harness {
  const win = new Window({ url: `http://localhost${initialPath}` });
  (globalThis as { window?: Window; document?: Document }).window = win;
  (globalThis as { window?: Window; document?: Document }).document = win.document;

  const { hook, navigate, history = [] } = memoryLocation({
    path: initialPath,
    static: false,
    record: true,
  });

  const rootEl = win.document.createElement("div");
  rootEl.id = "root";
  win.document.body.appendChild(rootEl);
  const root = createRoot(rootEl);

  return { hook, navigate, history, root, rootEl, win };
}

async function renderHarness(harness: Harness, element: React.ReactElement) {
  await act(async () => {
    harness.root.render(element);
  });
  await act(async () => new Promise((r) => setTimeout(r, 25)));
}

function getText(id: string): string | undefined {
  return (globalThis.document as Document).getElementById(id)?.textContent ?? undefined;
}

function getHref(id: string): string | null {
  return (globalThis.document as Document).getElementById(id)?.getAttribute("href");
}

async function click(id: string) {
  const el = (globalThis.document as Document).getElementById(id);
  assert.ok(el, `missing element #${id}`);
  await act(async () => {
    el.click();
  });
  await act(async () => new Promise((r) => setTimeout(r, 25)));
}

function SubscriptionDetailProbe() {
  const [loc] = useLocation();
  const [, params] = useRoute("/:companyId");
  const raw = params?.companyId ?? "";
  const companyId = raw && isUuidSegment(raw) ? raw : null;
  return React.createElement(
    "div",
    { id: "subscription-detail" },
    JSON.stringify({ loc, companyId, mounted: true }),
  );
}

function TabProbe() {
  return React.createElement("div", { id: "detail-tabs" }, "tabs-mounted");
}

function SubscriptionDetailWithTabs() {
  const [, params] = useRoute("/:companyId");
  const companyId = params?.companyId && isUuidSegment(params.companyId) ? params.companyId : null;
  if (!companyId) {
    return React.createElement("div", { id: "subscription-not-found" }, "not-found");
  }
  return React.createElement(
    "div",
    null,
    React.createElement(TabProbe, null),
    React.createElement("div", { id: "subscription-detail" }, companyId),
  );
}

function PageMarker({ id }: { id: string }) {
  return React.createElement("div", { id }, id);
}

function BillingLayoutProbe() {
  const [loc] = useLocation();
  return React.createElement(
    "div",
    null,
    React.createElement("div", { id: "billing-nest-loc" }, loc),
    React.createElement(
      Switch,
      null,
      ...BILLING_ROUTE_REGISTRY.map((route) =>
        React.createElement(
          Route,
          { key: route.id, path: route.nestedPath },
          React.createElement(PageMarker, { id: `billing-${route.id}` }),
        ),
      ),
      React.createElement(Route, { path: "/:companyId" }, React.createElement(SubscriptionDetailWithTabs, null)),
    ),
  );
}

function BillingOverviewWithLink() {
  return React.createElement(
    "div",
    null,
    React.createElement(PageMarker, { id: "billing-overview" }),
    React.createElement(Link, { href: billingDetailHref(DEMO_COMPANY_ID), id: "view-subscription-link" }, "View"),
    React.createElement(
      "nav",
      null,
      ...BILLING_ROUTE_REGISTRY.filter((r) => r.nestedPath !== "/").slice(0, 3).map((route) =>
        React.createElement(
          Link,
          {
            key: route.id,
            id: `billing-nav-${route.id}`,
            href: nestedSectionHref(route.nestedPath),
          },
          route.id,
        ),
      ),
    ),
  );
}

function BillingLayoutFull() {
  const [loc] = useLocation();
  return React.createElement(
    "div",
    null,
    React.createElement("div", { id: "billing-nest-loc" }, loc),
    React.createElement(
      Switch,
      null,
      React.createElement(Route, { path: "/" }, React.createElement(BillingOverviewWithLink, null)),
      ...BILLING_ROUTE_REGISTRY.filter((r) => r.nestedPath !== "/").map((route) =>
        React.createElement(
          Route,
          { key: route.id, path: route.nestedPath },
          React.createElement(PageMarker, { id: `billing-${route.id}` }),
        ),
      ),
      React.createElement(Route, { path: "/:companyId" }, React.createElement(SubscriptionDetailWithTabs, null)),
    ),
  );
}

function WorkspaceLayoutProbe() {
  const [loc] = useLocation();
  return React.createElement(
    "div",
    null,
    React.createElement("div", { id: "workspace-nest-loc" }, loc),
    React.createElement(
      Switch,
      null,
      ...WORKSPACE_ROUTE_REGISTRY.map((route) =>
        React.createElement(
          Route,
          { key: route.id, path: route.nestedPath },
          React.createElement(PageMarker, { id: `workspace-${route.id}` }),
        ),
      ),
    ),
  );
}

function WorkspaceOverviewWithLinks() {
  return React.createElement(
    "div",
    null,
    React.createElement(PageMarker, { id: "workspace-overview" }),
    React.createElement(Link, { href: nestedSectionHref("/billing"), id: "workspace-billing-link" }, "Billing"),
    React.createElement(Link, { href: nestedSectionHref("/usage"), id: "workspace-usage-link" }, "Usage"),
  );
}

function WorkspaceLayoutFull() {
  return React.createElement(
    Switch,
    null,
    React.createElement(Route, { path: "/" }, React.createElement(WorkspaceOverviewWithLinks, null)),
    ...WORKSPACE_ROUTE_REGISTRY.filter((r) => r.nestedPath !== "/").map((route) =>
      React.createElement(
        Route,
        { key: route.id, path: route.nestedPath },
        React.createElement(PageMarker, { id: `workspace-${route.id}` }),
      ),
    ),
  );
}

function DashboardOutletProbe({
  billing = false,
  workspace = false,
}: {
  billing?: boolean;
  workspace?: boolean;
}) {
  const [loc] = useLocation();
  return React.createElement(
    "div",
    null,
    React.createElement("div", { id: "dashboard-nest-loc" }, loc),
    React.createElement(
      Switch,
      null,
      billing
        ? React.createElement(Route, { path: "/subscriptions", nest: true }, React.createElement(BillingLayoutFull, null))
        : null,
      workspace
        ? React.createElement(Route, { path: "/workspace", nest: true }, React.createElement(WorkspaceLayoutFull, null))
        : null,
      ...DASHBOARD_ROUTE_REGISTRY.filter((r) => r.id !== "subscriptions" && r.id !== "workspace").slice(0, 3).map(
        (route) =>
          React.createElement(
            Route,
            { key: route.id, path: route.nestedPath },
            React.createElement(PageMarker, { id: `dashboard-${route.id}` }),
          ),
      ),
      React.createElement(Route, { path: "/" }, React.createElement(PageMarker, { id: "dashboard-home" })),
    ),
  );
}

function AppShell({
  billing,
  workspace,
  platformSections,
}: {
  billing?: boolean;
  workspace?: boolean;
  platformSections?: boolean;
}) {
  return React.createElement(
    Router,
    { hook: (globalThis as { __routingHook?: Harness["hook"] }).__routingHook! },
    React.createElement(
      Switch,
      null,
      React.createElement(
        Route,
        { path: "/dashboard", nest: true },
        React.createElement(DashboardOutletProbe, {
          billing,
          workspace,
          ...(platformSections ? {} : {}),
        }),
      ),
    ),
  );
}

function mountApp(
  harness: Harness,
  options: { billing?: boolean; workspace?: boolean } = { billing: true },
) {
  (globalThis as { __routingHook?: Harness["hook"] }).__routingHook = harness.hook;
  return renderHarness(
    harness,
    React.createElement(AppShell, { billing: options.billing, workspace: options.workspace }),
  );
}

function normalizeAbsolutePath(path: string): string {
  if (path.length > 1 && path.endsWith("/")) {
    return path.replace(/\/+$/, "");
  }
  return path;
}

function assertAbsolutePath(harness: Harness, expected: string, label: string) {
  const actual = normalizeAbsolutePath(harness.history.at(-1)!);
  const normalizedExpected = normalizeAbsolutePath(expected);
  assert.equal(actual, normalizedExpected, `${label}: expected ${normalizedExpected}, got ${actual}`);
  assertNoDuplicateAdjacentSegments(actual);
}

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>) {
  return (async () => {
    try {
      await fn();
      passed += 1;
      console.log(`  ✓ ${name}`);
    } catch (error) {
      failed += 1;
      console.error(`  ✗ ${name}`);
      console.error(`    ${error instanceof Error ? error.message : String(error)}`);
    }
  })();
}

console.log("\nNested routing tests\n");

await test("unit: nestedSectionHref preserves registry paths", () => {
  assert.equal(nestedSectionHref("/"), "/");
  assert.equal(nestedSectionHref("/payments"), "/payments");
  assert.equal(billingDetailHref(DEMO_COMPANY_ID), `/${DEMO_COMPANY_ID}`);
});

await test("unit: toDashboardAbsolutePath has no duplicate segments", () => {
  const paths = [
    toDashboardAbsolutePath("/subscriptions"),
    toDashboardAbsolutePath(`/subscriptions/${DEMO_COMPANY_ID}`),
    toDashboardAbsolutePath("/workspace/billing"),
    toDashboardAbsolutePath("/customers"),
  ];
  for (const p of paths) {
    assertNoDuplicateAdjacentSegments(p);
  }
});

{
  const harness = setupHarness("/dashboard/subscriptions");
  await mountApp(harness, { billing: true });

  await test("billing: overview → detail via View subscription link", async () => {
    assert.ok(getText("billing-overview"));
    assert.equal(getHref("view-subscription-link"), `/dashboard/subscriptions/${DEMO_COMPANY_ID}`);
    await click("view-subscription-link");
    assertAbsolutePath(harness, `/dashboard/subscriptions/${DEMO_COMPANY_ID}`, "overview → detail");
    assert.equal(getText("billing-nest-loc"), `/${DEMO_COMPANY_ID}`);
    assert.equal(getText("subscription-detail"), DEMO_COMPANY_ID);
  });

  await test("billing: detail → tabs mount", async () => {
    assert.equal(getText("detail-tabs"), "tabs-mounted");
  });

  await test("billing: detail → back to overview", async () => {
    await renderHarness(
      harness,
      React.createElement(
        Router,
        { hook: harness.hook },
        React.createElement(
          Route,
          { path: "/dashboard", nest: true },
          React.createElement(
            Route,
            { path: "/subscriptions", nest: true },
            React.createElement(
              "div",
              null,
              React.createElement(Link, { href: nestedSectionHref("/"), id: "back-to-overview" }, "Back"),
              React.createElement(BillingLayoutFull, null),
            ),
          ),
        ),
      ),
    );
    harness.navigate(`/dashboard/subscriptions/${DEMO_COMPANY_ID}`);
    await act(async () => new Promise((r) => setTimeout(r, 25)));
    await click("back-to-overview");
    assertAbsolutePath(harness, "/dashboard/subscriptions", "detail → overview");
    assert.ok(getText("billing-overview"));
  });

  await test("billing: platform sub-nav routes resolve without duplicated /subscriptions", async () => {
    harness.navigate("/dashboard/subscriptions");
    await mountApp(harness, { billing: true });
    for (const route of BILLING_ROUTE_REGISTRY.filter((r) => r.nestedPath !== "/").slice(0, 4)) {
      const linkId = `billing-nav-${route.id}`;
      if (!getHref(linkId)) continue;
      const expectedAbs = toDashboardAbsolutePath(`/subscriptions${nestedSectionHref(route.nestedPath)}`);
      assert.equal(getHref(linkId), expectedAbs, `href for ${route.id}`);
      await click(linkId);
      assertAbsolutePath(harness, expectedAbs, `nav → ${route.id}`);
      assert.ok(getText(`billing-${route.id}`), `page ${route.id} mounted`);
      harness.navigate("/dashboard/subscriptions");
      await act(async () => new Promise((r) => setTimeout(r, 15)));
      await mountApp(harness, { billing: true });
    }
  });
}

{
  await test("workspace: legacy module targets company plan & billing tab", async () => {
    const { companyWorkspaceHref } = await import("../src/lib/company-workspace/company-workspace-routes.ts");
    const target = companyWorkspaceHref("subscription");
    assert.match(target, /\/company\?tab=subscription/);
  });

  await test("workspace: registry absolute paths have no duplicated segments", async () => {
    for (const route of WORKSPACE_ROUTE_REGISTRY) {
      const abs = toDashboardAbsolutePath(`/workspace${nestedSectionHref(route.nestedPath)}`);
      assertNoDuplicateAdjacentSegments(abs);
    }
  });
}

{
  const harness = setupHarness("/dashboard");
  (globalThis as { __routingHook?: Harness["hook"] }).__routingHook = harness.hook;
  await renderHarness(
    harness,
    React.createElement(
      Router,
      { hook: harness.hook },
      React.createElement(
        Route,
        { path: "/dashboard", nest: true },
        React.createElement(DashboardOutletProbe, { billing: false, workspace: false }),
      ),
    ),
  );

  await test("dashboard: home and top-level sections use dashboard-nest-relative paths", async () => {
    assert.ok(getText("dashboard-home"));
    for (const route of DASHBOARD_ROUTE_REGISTRY.filter((r) => !["subscriptions", "workspace"].includes(r.id)).slice(0, 3)) {
      const abs = toDashboardAbsolutePath(route.nestedPath);
      harness.navigate(abs);
      await act(async () => new Promise((r) => setTimeout(r, 15)));
      await renderHarness(
        harness,
        React.createElement(
          Router,
          { hook: harness.hook },
          React.createElement(
            Route,
            { path: "/dashboard", nest: true },
            React.createElement(DashboardOutletProbe, { billing: false, workspace: false }),
          ),
        ),
      );
      assertNoDuplicateAdjacentSegments(abs);
      assert.equal(getText("dashboard-nest-loc"), route.nestedPath);
    }
  });
}

{
  const harness = setupHarness("/dashboard/subscriptions");
  await mountApp(harness, { billing: true });

  await test("regression: parent-prefixed /subscriptions/{id} must NOT be used in billing nest", async () => {
    await renderHarness(
      harness,
      React.createElement(
        Router,
        { hook: harness.hook },
        React.createElement(
          Route,
          { path: "/dashboard", nest: true },
          React.createElement(
            Route,
            { path: "/subscriptions", nest: true },
            React.createElement(
              "div",
              null,
              React.createElement(Link, { href: `/subscriptions/${DEMO_COMPANY_ID}`, id: "bad-link" }, "Bad"),
              React.createElement(BillingLayoutFull, null),
            ),
          ),
        ),
      ),
    );
    const badHref = getHref("bad-link");
    assert.ok(badHref?.includes("/subscriptions/subscriptions/"), "bad pattern produces duplicate segment");
    assert.throws(
      () => assertNoDuplicateAdjacentSegments(badHref!),
      /Duplicate adjacent path segment "subscriptions"/,
    );
  });
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
