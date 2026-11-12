import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { confineToPathPrefixes } from "./confine-router-paths.js";

describe("confineToPathPrefixes", () => {
  it("continues for matching prefixes and exits the router otherwise", () => {
    const guard = confineToPathPrefixes("/mobile", "/whatsapp");
    let nextArg: unknown;
    guard({ path: "/mobile/session" } as never, {} as never, ((arg?: unknown) => {
      nextArg = arg;
    }) as never);
    assert.equal(nextArg, undefined);

    nextArg = "unset";
    guard({ path: "/email/health" } as never, {} as never, ((arg?: unknown) => {
      nextArg = arg;
    }) as never);
    assert.equal(nextArg, "router");
  });
});
