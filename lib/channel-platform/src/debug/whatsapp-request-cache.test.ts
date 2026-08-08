import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  runWithWhatsAppRequestCache,
  setWhatsAppRequestCache,
  WhatsAppRequestCache,
} from "./whatsapp-request-cache.js";
import {
  WA_REQUEST_CACHE_NS,
  waRequestGetOrCreateSync,
  waRequestGetOrLoad,
} from "./whatsapp-request-scope.js";

describe("WhatsAppRequestCache", () => {
  it("loads once per key within a request scope and counts hits as saved time", async () => {
    const cache = new WhatsAppRequestCache("req-cache-1");
    let loads = 0;

    await runWithWhatsAppRequestCache(cache, async () => {
      const first = await waRequestGetOrLoad(WA_REQUEST_CACHE_NS.whatsappCredentials, "co-1", async () => {
        loads += 1;
        await new Promise((r) => setTimeout(r, 20));
        return { token: "abc" };
      });
      const second = await waRequestGetOrLoad(WA_REQUEST_CACHE_NS.whatsappCredentials, "co-1", async () => {
        loads += 1;
        return { token: "should-not-run" };
      });
      assert.equal(first.token, "abc");
      assert.equal(second.token, "abc");
    });

    assert.equal(loads, 1);
    const stats = cache.getStageStats();
    const creds = stats.find((s) => s.namespace === WA_REQUEST_CACHE_NS.whatsappCredentials);
    assert.ok(creds);
    assert.equal(creds.loads, 1);
    assert.equal(creds.hits, 1);
    assert.ok(creds.savedMs >= 15);
    setWhatsAppRequestCache(null);
  });

  it("does not cache across request scopes", async () => {
    let loads = 0;
    const loader = async () => {
      loads += 1;
      return "v";
    };

    const a = new WhatsAppRequestCache("a");
    await runWithWhatsAppRequestCache(a, async () => {
      await waRequestGetOrLoad(WA_REQUEST_CACHE_NS.companyChannel, "ch-1", loader);
    });
    setWhatsAppRequestCache(null);

    const b = new WhatsAppRequestCache("b");
    await runWithWhatsAppRequestCache(b, async () => {
      await waRequestGetOrLoad(WA_REQUEST_CACHE_NS.companyChannel, "ch-1", loader);
    });
    setWhatsAppRequestCache(null);

    assert.equal(loads, 2);
  });

  it("falls back to direct load outside request scope", async () => {
    setWhatsAppRequestCache(null);
    let loads = 0;
    const value = await waRequestGetOrLoad(WA_REQUEST_CACHE_NS.session, "s-1", async () => {
      loads += 1;
      return "direct";
    });
    assert.equal(value, "direct");
    assert.equal(loads, 1);
  });

  it("constructs sync factories once per key within a request scope", async () => {
    const cache = new WhatsAppRequestCache("req-sync-1");
    let builds = 0;

    await runWithWhatsAppRequestCache(cache, async () => {
      const first = waRequestGetOrCreateSync(WA_REQUEST_CACHE_NS.schedulingServices, "c1", () => {
        builds += 1;
        return { id: "svc" };
      });
      const second = waRequestGetOrCreateSync(WA_REQUEST_CACHE_NS.schedulingServices, "c1", () => {
        builds += 1;
        return { id: "other" };
      });
      assert.equal(first.id, "svc");
      assert.equal(second.id, "svc");
      assert.equal(first, second);
    });

    assert.equal(builds, 1);
    const stats = cache.getStageStats();
    const stage = stats.find((s) => s.namespace === WA_REQUEST_CACHE_NS.schedulingServices);
    assert.ok(stage);
    assert.equal(stage.loads, 1);
    assert.equal(stage.hits, 1);
    setWhatsAppRequestCache(null);
  });

  it("does not memoize sync factories outside request scope", () => {
    setWhatsAppRequestCache(null);
    let builds = 0;
    waRequestGetOrCreateSync(WA_REQUEST_CACHE_NS.branchServices, "c1", () => {
      builds += 1;
      return 1;
    });
    waRequestGetOrCreateSync(WA_REQUEST_CACHE_NS.branchServices, "c1", () => {
      builds += 1;
      return 2;
    });
    assert.equal(builds, 2);
  });
});
