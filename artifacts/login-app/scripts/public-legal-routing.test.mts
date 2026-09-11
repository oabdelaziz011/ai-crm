import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { Window } from "happy-dom";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { Route, Router, Switch } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { isPublicLegalPath, PUBLIC_LEGAL_PATHS } from "../src/lib/legal/public-legal-paths.ts";

const here = dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(resolve(here, "../src/App.tsx"), "utf8");
const authRedirectSource = readFileSync(resolve(here, "../src/lib/auth-redirect.ts"), "utf8");
const onboardingGateSource = readFileSync(
  resolve(here, "../src/components/companies/first-time-company-onboarding-gate.tsx"),
  "utf8",
);

type Harness = {
  hook: ReturnType<typeof memoryLocation>["hook"];
  root: Root;
  rootEl: HTMLElement;
};

function setupHarness(initialPath: string): Harness {
  const win = new Window({ url: `http://localhost${initialPath}` });
  (globalThis as { window?: Window; document?: Document }).window = win;
  (globalThis as { window?: Window; document?: Document }).document = win.document;

  const { hook } = memoryLocation({
    path: initialPath,
    static: true,
  });

  const rootEl = win.document.createElement("div");
  rootEl.id = "root";
  win.document.body.appendChild(rootEl);
  const root = createRoot(rootEl);
  return { hook, root, rootEl };
}

async function renderPublicLegalSwitch(path: string) {
  const harness = setupHarness(path);
  await act(async () => {
    harness.root.render(
      React.createElement(
        Router,
        { hook: harness.hook },
        React.createElement(
          Switch,
          null,
          ...PUBLIC_LEGAL_PATHS.map((legalPath) =>
            React.createElement(Route, {
              key: legalPath,
              path: legalPath,
              component: () =>
                React.createElement("div", { id: "legal-public" }, legalPath),
            }),
          ),
          React.createElement(Route, {
            component: () => React.createElement("div", { id: "auth-required" }, "login-required"),
          }),
        ),
      ),
    );
  });
  await act(async () => new Promise((r) => setTimeout(r, 25)));
  return harness;
}

describe("public legal routes", () => {
  it("are registered outside ProtectedRoute in App.tsx", () => {
    assert.match(appSource, /PUBLIC_LEGAL_ROUTES/);
    assert.match(appSource, /isPublicUnauthenticatedPath/);
    assert.doesNotMatch(
      appSource,
      /ProtectedRoute[\s\S]{0,200}privacy-policy|privacy-policy[\s\S]{0,200}ProtectedRoute/,
    );
  });

  it("are treated as unauthenticated paths by auth guards", () => {
    assert.match(authRedirectSource, /isPublicLegalPath/);
    assert.match(authRedirectSource, /isPublicUnauthenticatedPath/);
    assert.match(onboardingGateSource, /isPublicUnauthenticatedPath/);
    for (const path of PUBLIC_LEGAL_PATHS) {
      assert.equal(isPublicLegalPath(path), true);
    }
  });

  it("has a Vercel SPA fallback so legal URLs work on direct navigation", () => {
    const vercel = JSON.parse(
      readFileSync(resolve(here, "../../../vercel.json"), "utf8"),
    ) as { rewrites?: Array<{ source: string; destination: string }> };
    const fallback = vercel.rewrites?.find((rule) => rule.destination === "/index.html");
    assert.ok(fallback, "vercel.json must rewrite unknown paths to index.html");
    for (const path of PUBLIC_LEGAL_PATHS) {
      assert.match(fallback.source, /\(\.\*\)/);
      assert.equal(path.startsWith("/"), true);
    }
  });

  it("render without an authenticated user", async () => {
    for (const path of PUBLIC_LEGAL_PATHS) {
      const harness = await renderPublicLegalSwitch(path);
      const publicEl = (globalThis.document as Document).getElementById("legal-public");
      const gatedEl = (globalThis.document as Document).getElementById("auth-required");
      assert.equal(publicEl?.textContent, path);
      assert.equal(gatedEl, null);
      harness.root.unmount();
    }
  });
});
