import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  createApplicationLayerRegistry,
  createContext,
} from "../index.js";

describe("Feature Flags & Licensing GA-1.4 — application layer", () => {
  let registry: ReturnType<typeof createApplicationLayerRegistry>;

  beforeEach(() => {
    registry = createApplicationLayerRegistry({ useMockPorts: true });
  });

  const adminContext = () =>
    createContext({
      tenantId: "tenant_1",
      actorId: "user_admin",
      permissions: ["*"],
    });

  it("resolves feature flag through CQRS with license gating", async () => {
    const services = registry.getServices();

    await services.featureFlags.upsert(
      {
        featureKey: "knowledge.platform",
        scopeType: "company",
        scopeId: "tenant_1",
        enabled: true,
      },
      adminContext(),
    );

    const result = await services.featureFlags.isEnabled(
      { featureKey: "knowledge.platform" },
      adminContext(),
    );

    assert.equal(result.data.enabled, true);
    assert.equal(result.data.licenseBlocked, false);
  });

  it("blocks feature when disabled at company scope", async () => {
    const services = registry.getServices();

    await services.featureFlags.upsert(
      {
        featureKey: "ai.analytics",
        scopeType: "company",
        scopeId: "tenant_1",
        enabled: false,
      },
      adminContext(),
    );

    const result = await services.featureFlags.isEnabled(
      { featureKey: "ai.analytics" },
      adminContext(),
    );

    assert.equal(result.data.enabled, false);
  });

  it("resolves many feature flags in one query", async () => {
    const services = registry.getServices();

    const result = await services.featureFlags.resolveMany(
      { featureKeys: ["ai.chat", "knowledge.platform"] },
      adminContext(),
    );

    assert.equal(typeof result.data["ai.chat"], "boolean");
    assert.equal(typeof result.data["knowledge.platform"], "boolean");
  });

  it("checks license access through licensing service", async () => {
    const services = registry.getServices();

    const result = await services.licensing.canAccess(
      { featureKey: "ai.employee" },
      adminContext(),
    );

    assert.equal(result.data.allowed, true);
    assert.equal(result.data.planCode, "enterprise");
  });

  it("denies feature flag write without permission", async () => {
    const services = registry.getServices();

    await assert.rejects(() =>
      services.featureFlags.upsert(
        {
          featureKey: "customer.portal",
          scopeType: "company",
          enabled: true,
        },
        createContext({ tenantId: "tenant_1", actorId: "user_1", permissions: [] }),
      ),
    );
  });
});
