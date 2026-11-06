import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { StartupTimeout, restoreMobileSession, startupDirectionPlan, withDeadline } from "./startup";

describe("startup", () => {
  it("opens without reloading when Arabic is saved and the native layout is still left to right", () => {
    const plan = startupDirectionPlan({ language: "ar", isRTL: false, pendingReload: null });
    assert.equal(plan.reload, false);
    assert.equal(plan.forceRTL, true);
    assert.equal(plan.clearPending, false);
  });

  it("does not reload a fresh English or German launch", () => {
    assert.equal(startupDirectionPlan({ language: "en", isRTL: false, pendingReload: null }).reload, false);
    assert.equal(startupDirectionPlan({ language: "de", isRTL: false, pendingReload: "ltr" }).reload, false);
    assert.equal(startupDirectionPlan({ language: "ar", isRTL: true, pendingReload: "rtl" }).clearPending, true);
  });

  it("ends a hung startup and keeps a finished one", async () => {
    await assert.rejects(withDeadline(new Promise(() => undefined), 20), StartupTimeout);
    assert.equal(await withDeadline(Promise.resolve("ready"), 50), "ready");
  });

  it("skips restoration when no workspace is saved and keeps an unavailable API signed in", async () => {
    let reads = 0;
    let loads = 0;
    const fresh = await restoreMobileSession({
      readAccessToken: async () => {
        reads += 1;
        return "token";
      },
      readHostname: async () => null,
      loadSession: async () => {
        loads += 1;
        return { ok: true, session: { id: "user-1" } };
      },
      signOut: async () => undefined,
      clearHostname: async () => undefined,
    });
    assert.equal(fresh.outcome, "none");
    assert.equal(reads, 0);
    assert.equal(loads, 0);

    const restored = await restoreMobileSession({
      readAccessToken: async () => "token",
      readHostname: async () => "acme.valueor.org",
      loadSession: async () => ({ ok: true, session: { id: "user-1" } }),
      signOut: async () => undefined,
      clearHostname: async () => undefined,
    });
    assert.equal(restored.outcome, "restored");
    if (restored.outcome === "restored") assert.equal(restored.session.id, "user-1");

    let cleared = false;
    const rejected = await restoreMobileSession({
      readAccessToken: async () => "token",
      readHostname: async () => "acme.valueor.org",
      loadSession: async () => ({ ok: false, failure: "auth" }),
      signOut: async () => undefined,
      clearHostname: async () => {
        cleared = true;
      },
    });
    assert.equal(rejected.outcome, "none");
    assert.equal(cleared, true);

    let signedOut = false;
    const unavailable = await restoreMobileSession({
      readAccessToken: async () => "token",
      readHostname: async () => "acme.valueor.org",
      loadSession: async () => ({ ok: false, failure: "unavailable" }),
      signOut: async () => {
        signedOut = true;
      },
      clearHostname: async () => undefined,
    });
    assert.equal(unavailable.outcome, "unavailable");
    assert.equal(signedOut, false);

    await assert.rejects(
      withDeadline(
        restoreMobileSession({
          readAccessToken: () => new Promise(() => undefined),
          readHostname: async () => "acme.valueor.org",
          loadSession: async () => ({ ok: true, session: { id: "user-1" } }),
          signOut: async () => undefined,
          clearHostname: async () => undefined,
        }),
        20,
      ),
      StartupTimeout,
    );
  });
});
