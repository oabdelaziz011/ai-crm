import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  beginVariableResolverRegistration,
  freezeVariableResolverRegistry,
  getVariableResolverRegistryState,
  getVariableResolvers,
  registerVariableResolver,
  resolveViaRegistry,
  resetVariableResolverRegistryForTests,
  type VariableResolver,
} from "./variable-resolver-registry.js";

function createResolver(input: {
  id: string;
  namespace: string;
  priority?: number;
  fields: string[];
  value?: unknown;
}): VariableResolver {
  return {
    id: input.id,
    namespace: input.namespace,
    priority: input.priority,
    canResolve(segments) {
      return segments.length === 2 && input.fields.includes(segments[1]!);
    },
    resolve() {
      return input.value ?? `${input.id}:${input.fields[0]}`;
    },
  };
}

function bootstrap(...resolvers: VariableResolver[]): void {
  beginVariableResolverRegistration();
  for (const resolver of resolvers) {
    registerVariableResolver(resolver);
  }
  freezeVariableResolverRegistry();
}

beforeEach(() => {
  resetVariableResolverRegistryForTests();
});

describe("variable resolver registry", () => {
  it("registers resolvers during registration mode and freezes", () => {
    bootstrap(createResolver({ id: "test.one", namespace: "lookup", fields: ["found"], value: true }));

    assert.equal(getVariableResolverRegistryState(), "FROZEN");
    assert.equal(getVariableResolvers("lookup").length, 1);
  });

  it("rejects registration before beginRegistration", () => {
    assert.throws(
      () => registerVariableResolver(createResolver({ id: "x", namespace: "lookup", fields: ["found"] })),
      /has not entered registration mode/,
    );
  });

  it("rejects registration after freeze", () => {
    bootstrap(createResolver({ id: "test.one", namespace: "lookup", fields: ["found"] }));

    assert.throws(
      () => registerVariableResolver(createResolver({ id: "test.two", namespace: "lookup", fields: ["count"] })),
      /already been frozen/,
    );
  });

  it("is idempotent for duplicate resolver ids", () => {
    const resolver = createResolver({ id: "crm.lookup.default", namespace: "lookup", fields: ["found"] });
    bootstrap(resolver, resolver, resolver);

    assert.equal(getVariableResolvers("lookup").length, 1);
  });

  it("evaluates higher priority resolvers first", () => {
    bootstrap(
      createResolver({ id: "low", namespace: "customer", priority: 0, fields: ["displayName"], value: "low" }),
      createResolver({ id: "high", namespace: "customer", priority: 100, fields: ["displayName"], value: "high" }),
    );

    assert.equal(
      resolveViaRegistry(["customer", "displayName"], {}),
      "high",
    );
  });

  it("uses registration order as tie-breaker for equal priority", () => {
    resetVariableResolverRegistryForTests();
    beginVariableResolverRegistration();
    registerVariableResolver(
      createResolver({ id: "second", namespace: "customer", priority: 10, fields: ["displayName"], value: "second" }),
    );
    registerVariableResolver(
      createResolver({ id: "first", namespace: "customer", priority: 10, fields: ["displayName"], value: "first" }),
    );
    freezeVariableResolverRegistry();

    assert.equal(resolveViaRegistry(["customer", "displayName"], {}), "second");
  });

  it("falls through when higher priority resolver declines", () => {
    bootstrap(
      createResolver({ id: "stats", namespace: "customer", priority: 100, fields: ["isVip"], value: "vip" }),
      createResolver({ id: "display", namespace: "customer", priority: 50, fields: ["displayName"], value: "name" }),
    );

    assert.equal(resolveViaRegistry(["customer", "displayName"], {}), "name");
  });

  it("falls back to default traversal for unclaimed paths", () => {
    bootstrap(createResolver({ id: "lookup", namespace: "lookup", fields: ["found"], value: true }));

    assert.equal(
      resolveViaRegistry(["customer", "name"], { customer: { name: "Omar" } }),
      "Omar",
    );
  });

  it("returns immutable resolver collections", () => {
    bootstrap(createResolver({ id: "lookup", namespace: "lookup", fields: ["found"] }));
    const resolvers = getVariableResolvers("lookup");

    assert.throws(() => {
      (resolvers as VariableResolver[]).push(
        createResolver({ id: "extra", namespace: "lookup", fields: ["count"] }),
      );
    });
  });

  it("reset helper restores uninitialized registry", () => {
    bootstrap(createResolver({ id: "lookup", namespace: "lookup", fields: ["found"] }));
    resetVariableResolverRegistryForTests();

    assert.equal(getVariableResolverRegistryState(), "UNINITIALIZED");
    beginVariableResolverRegistration();
    assert.equal(getVariableResolvers("lookup").length, 0);
  });

  it("resolve works after freeze", () => {
    bootstrap(createResolver({ id: "lookup", namespace: "lookup", fields: ["found"], value: true }));

    assert.equal(resolveViaRegistry(["lookup", "found"], { lookup: { status: "found", count: 1 } }), true);
  });
});
