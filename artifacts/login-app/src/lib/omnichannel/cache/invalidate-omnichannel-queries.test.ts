import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { QueryClient } from "@tanstack/react-query";
import {
  invalidateOmnichannelQueries,
  OMNICHANNEL_INVALIDATE_DEBOUNCE_MS,
} from "./invalidate-omnichannel-queries.ts";

function waitForInvalidate() {
  return new Promise((resolve) => setTimeout(resolve, OMNICHANNEL_INVALIDATE_DEBOUNCE_MS + 30));
}

describe("invalidateOmnichannelQueries", () => {
  it("invalidates the desk conversation-list infinite key prefix", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const companyId = "company-1";
    const listKey = ["conversation-list", companyId, { searchQuery: undefined }, "infinite", 40];
    await qc.fetchQuery({
      queryKey: listKey,
      queryFn: async () => ({ pages: [{ rows: [] }] }),
    });
    invalidateOmnichannelQueries(qc, { companyId, source: "test" });
    await waitForInvalidate();
    const state = qc.getQueryState(listKey);
    assert.equal(state?.isInvalidated, true);
  });

  it("invalidates conversation-messages for the inbound conversation id", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const companyId = "company-1";
    const conversationId = "conv-1";
    const msgKey = ["conversation-messages", conversationId];
    await qc.fetchQuery({
      queryKey: msgKey,
      queryFn: async () => [],
    });
    invalidateOmnichannelQueries(qc, { companyId, conversationId, source: "test" });
    await waitForInvalidate();
    const state = qc.getQueryState(msgKey);
    assert.equal(state?.isInvalidated, true);
  });

  it("collapses rapid realtime events into one list invalidation", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const companyId = "company-1";
    const listKey = ["conversation-list", companyId, {}, "infinite", 40];
    let fetches = 0;
    await qc.fetchQuery({
      queryKey: listKey,
      queryFn: async () => {
        fetches += 1;
        return { pages: [{ rows: [] }] };
      },
    });
    invalidateOmnichannelQueries(qc, { companyId, conversationId: "a", source: "test" });
    invalidateOmnichannelQueries(qc, { companyId, conversationId: "b", source: "test" });
    invalidateOmnichannelQueries(qc, { companyId, conversationId: "a", source: "test" });
    assert.equal(qc.getQueryState(listKey)?.isInvalidated, false);
    await waitForInvalidate();
    assert.equal(qc.getQueryState(listKey)?.isInvalidated, true);
    assert.equal(fetches, 1);
  });
});
