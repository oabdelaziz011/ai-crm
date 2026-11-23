/**
 * Phase 0A — Home Ask AI must mount + open Floating AI via requestOpenFloatingAi.
 * Does not exercise Guide Mode, runtime, or tool router.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { Window } from "happy-dom";
import {
  FLOATING_AI_OPEN_EVENT,
  requestOpenFloatingAi,
  type FloatingAiOpenDetail,
} from "./open-assistant";

const here = dirname(fileURLToPath(import.meta.url));
const homePagePath = join(here, "../../pages/dashboard/home-page.tsx");
const headerPath = join(here, "../../components/app-shell/app-header.tsx");
const launcherPath = join(here, "../../components/floating-ai/floating-ai-launcher.tsx");

function installDom() {
  const win = new Window({ url: "http://127.0.0.1:5173/dashboard" });
  const define = (key: string, value: unknown) => {
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  };
  define("window", win);
  define("document", win.document);
  define("CustomEvent", win.CustomEvent);
  define("addEventListener", win.addEventListener.bind(win));
  define("removeEventListener", win.removeEventListener.bind(win));
  define("dispatchEvent", win.dispatchEvent.bind(win));
  return win;
}

describe("Phase 0A Home Ask AI open path", () => {
  afterEach(() => {
    // happy-dom windows are GC'd per test; no shared listeners required
  });

  it("wires Home Ask AI to requestOpenFloatingAi (not setCopilotOpen alone)", () => {
    const home = readFileSync(homePagePath, "utf8");
    assert.match(home, /requestOpenFloatingAi/);
    assert.match(home, /onClick=\{\(\) => requestOpenFloatingAi\(\{\s*surface:\s*"guide"\s*\}\)\}/);
    assert.doesNotMatch(home, /setCopilotOpen\(true\)/);
    assert.doesNotMatch(home, /useAppShell/);
  });

  it("keeps Sparkles header on activate + openPanel path", () => {
    const header = readFileSync(headerPath, "utf8");
    assert.match(header, /onActivateAi\?\.\(\)/);
    assert.match(header, /openPanel\(\)/);
    assert.match(header, /handleToggleAi/);
  });

  it("keeps Ctrl/Cmd+K launcher onActivate + openPanel and open-event listener", () => {
    const launcher = readFileSync(launcherPath, "utf8");
    assert.match(launcher, /FLOATING_AI_OPEN_EVENT/);
    assert.match(launcher, /onActivate\(\)/);
    assert.match(launcher, /openPanel\(\)/);
    assert.match(launcher, /event\.key\.toLowerCase\(\) === "k"/);
  });

  it("requestOpenFloatingAi mounts path: cold open dispatches once and notifies listeners", () => {
    installDom();
    const events: FloatingAiOpenDetail[] = [];
    const onOpen = (event: Event) => {
      events.push((event as CustomEvent<FloatingAiOpenDetail>).detail ?? {});
    };
    window.addEventListener(FLOATING_AI_OPEN_EVENT, onOpen);

    // Simulate Home Ask AI with no prior open
    requestOpenFloatingAi({ surface: "guide" });

    assert.equal(events.length, 1);
    assert.deepEqual(events[0], { surface: "guide" });
    window.removeEventListener(FLOATING_AI_OPEN_EVENT, onOpen);
  });

  it("requestOpenFloatingAi warm open: second call still dispatches (idempotent reopen)", () => {
    installDom();
    let activateCount = 0;
    let openCount = 0;

    // Mirror FloatingAiLauncher openAssistant side effects without mounting React
    const onOpenRequest = () => {
      activateCount += 1;
      openCount += 1;
    };
    window.addEventListener(FLOATING_AI_OPEN_EVENT, onOpenRequest);

    requestOpenFloatingAi(); // cold
    requestOpenFloatingAi(); // warm / after prior open

    assert.equal(activateCount, 2);
    assert.equal(openCount, 2);
    window.removeEventListener(FLOATING_AI_OPEN_EVENT, onOpenRequest);
  });
});
