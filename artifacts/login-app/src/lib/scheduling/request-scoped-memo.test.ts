import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  runWithWhatsAppRequestCache,
  setWhatsAppRequestCache,
  WhatsAppRequestCache,
} from "@workspace/channel-platform/server";
import {
  memoizeSchedulingFactory,
  memoizeSchedulingRead,
  WA_REQUEST_CACHE_NS,
} from "./request-scoped-memo";

describe("scheduling request-scoped memo", () => {
  it("reuses factory instances for the same client within one request", async () => {
    const cache = new WhatsAppRequestCache("sched-memo-1");
    const client = { tag: "supabase-stub" };
    let builds = 0;

    await runWithWhatsAppRequestCache(cache, async () => {
      const a = memoizeSchedulingFactory(WA_REQUEST_CACHE_NS.schedulingServices, client, () => {
        builds += 1;
        return { n: builds };
      });
      const b = memoizeSchedulingFactory(WA_REQUEST_CACHE_NS.schedulingServices, client, () => {
        builds += 1;
        return { n: builds };
      });
      assert.equal(a, b);
      assert.equal(a.n, 1);
    });

    assert.equal(builds, 1);
    setWhatsAppRequestCache(null);
  });

  it("dedupes identical async reads within one request", async () => {
    const cache = new WhatsAppRequestCache("sched-read-1");
    let loads = 0;

    await runWithWhatsAppRequestCache(cache, async () => {
      const first = await memoizeSchedulingRead(WA_REQUEST_CACHE_NS.schedulingBookingRules, "co", async () => {
        loads += 1;
        return { company_id: "co" };
      });
      const second = await memoizeSchedulingRead(WA_REQUEST_CACHE_NS.schedulingBookingRules, "co", async () => {
        loads += 1;
        return { company_id: "other" };
      });
      assert.deepEqual(first, second);
    });

    assert.equal(loads, 1);
    setWhatsAppRequestCache(null);
  });
});
