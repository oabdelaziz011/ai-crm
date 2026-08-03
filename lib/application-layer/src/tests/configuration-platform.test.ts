import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  createApplicationLayerRegistry,
  createContext,
} from "../index.js";

describe("Configuration Platform GA-1.4 — application layer", () => {
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

  it("saves configuration draft through CQRS", async () => {
    const services = registry.getServices();
    const result = await services.configuration.saveDraft(
      {
        domain: "operations.workspace",
        scopeKey: "clinic",
        config: { workspaceName: "Clinic Ops", moduleName: "Operations", rowEntityName: "Visit", templateKey: "clinic" },
      },
      adminContext(),
    );
    assert.equal(result.data.domain, "operations.workspace");
    assert.equal(result.data.status, "draft");
  });

  it("publishes configuration and increments version", async () => {
    const services = registry.getServices();
    await services.configuration.saveDraft(
      {
        domain: "crm",
        scopeKey: "default",
        config: { leadSources: ["web", "referral"] },
      },
      adminContext(),
    );
    const published = await services.configuration.publish(
      { domain: "crm", scopeKey: "default" },
      adminContext(),
    );
    assert.equal(published.data.status, "published");
    assert.equal(published.data.version, 2);
  });

  it("reads configuration through query pipeline with cache", async () => {
    const services = registry.getServices();
    await services.configuration.saveDraft(
      {
        domain: "dashboard",
        scopeKey: "default",
        config: { widgets: ["kpi", "chart"] },
      },
      adminContext(),
    );
    await services.configuration.publish({ domain: "dashboard", scopeKey: "default" }, adminContext());

    const loaded = await services.configuration.getConfiguration(
      { domain: "dashboard", scopeKey: "default" },
      adminContext(),
    );
    assert.ok(loaded.data);
    assert.equal(loaded.data?.domain, "dashboard");
  });

  it("rolls back configuration to prior version", async () => {
    const services = registry.getServices();
    const draft = await services.configuration.saveDraft(
      {
        domain: "billing",
        scopeKey: "default",
        config: { currencies: ["USD"] },
      },
      adminContext(),
    );
    await services.configuration.publish({ domain: "billing", scopeKey: "default" }, adminContext());
    const rolled = await services.configuration.rollback(
      { configurationId: draft.data.id, targetVersion: 1 },
      adminContext(),
    );
    assert.equal(rolled.data.version, 1);
  });

  it("denies configuration write without permission", async () => {
    const services = registry.getServices();
    await assert.rejects(
      () =>
        services.configuration.saveDraft(
          { domain: "ai", scopeKey: "default", config: {} },
          createContext({ tenantId: "tenant_1", actorId: "user_1", permissions: [] }),
        ),
    );
  });
});
