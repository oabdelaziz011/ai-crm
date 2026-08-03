import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  createApplicationLayerRegistry,
  createContext,
  Customer360Aggregator,
  createMockApplicationPorts,
  ENTITY_TYPES,
  isEntityType,
} from "../index.js";

describe("Entity Platform — types", () => {
  it("registers all supported entity types without hardcoding in consumers", () => {
    assert.ok(ENTITY_TYPES.includes("customer"));
    assert.ok(ENTITY_TYPES.includes("lead"));
    assert.ok(ENTITY_TYPES.includes("company"));
    assert.equal(isEntityType("customer"), true);
    assert.equal(isEntityType("unknown"), false);
  });
});

describe("Entity Platform — ports", () => {
  let ports: ReturnType<typeof createMockApplicationPorts>;

  beforeEach(() => {
    ports = createMockApplicationPorts();
  });

  it("creates and lists entity contacts for any entity type", async () => {
    const contact = await ports.entityContactWrite.create({
      tenantId: "tenant_1",
      entityType: "lead",
      entityId: "lead_99",
      displayName: "Alex Morgan",
      emails: Object.freeze([Object.freeze({ value: "alex@example.com", isPrimary: true })]),
      actorUserId: "user_1",
    });

    const listed = await ports.entityContactRead.list("tenant_1", "lead", "lead_99");
    assert.equal(listed.length, 1);
    assert.equal(listed[0]?.id, contact.id);
    assert.equal(listed[0]?.displayName, "Alex Morgan");
  });

  it("creates entity activities with channel mapping", async () => {
    const activity = await ports.entityActivityWrite.create({
      tenantId: "tenant_1",
      entityType: "customer",
      entityId: "cust_1",
      activityType: "whatsapp",
      subject: "Follow-up",
      body: "Sent pricing",
      actorUserId: "user_1",
    });

    assert.equal(activity.channel, "whatsapp");
    const listed = await ports.entityActivityRead.list("tenant_1", "customer", "cust_1");
    assert.ok(listed.some((item) => item.id === activity.id));
  });

  it("assigns tags through universal tag write port", async () => {
    const tag = await ports.entityTagWrite.createDefinition({
      tenantId: "tenant_1",
      name: "VIP",
      color: "#f59e0b",
      actorUserId: "user_1",
    });

    await ports.entityTagWrite.assign("tenant_1", "customer", "cust_1", tag.id, "user_1");
    const assignments = await ports.entityTagRead.listForEntity("tenant_1", "customer", "cust_1");
    assert.equal(assignments.length, 1);
    assert.equal(assignments[0]?.tag.name, "VIP");
  });
});

describe("Entity Platform — CQRS", () => {
  it("executes CreateEntityContact through application service", async () => {
    const registry = createApplicationLayerRegistry({ useMockPorts: true });
    const services = registry.getServices();
    const context = createContext({
      tenantId: "tenant_1",
      actorId: "user_admin",
      permissions: ["entity.contacts.write"],
    });

    const result = await services.entity.createContact(
      {
        entityType: "company",
        entityId: "comp_1",
        displayName: "Billing Desk",
        contactType: "billing",
      },
      context,
    );

    assert.equal(result.data?.contact.displayName, "Billing Desk");
  });
});

describe("Entity Platform — Customer360 integration", () => {
  it("feeds customer facade ports from universal entity data", async () => {
    const ports = createMockApplicationPorts();

    const tag = await ports.entityTagWrite.createDefinition({
      tenantId: "tenant_1",
      name: "Enterprise",
      actorUserId: "user_1",
    });
    await ports.entityTagWrite.assign("tenant_1", "customer", "cust_1", tag.id, "user_1");

    await ports.entityContactWrite.create({
      tenantId: "tenant_1",
      entityType: "customer",
      entityId: "cust_1",
      displayName: "Primary Contact",
      phones: Object.freeze([Object.freeze({ value: "+1-555-0100", isPrimary: true })]),
      actorUserId: "user_1",
    });

    await ports.entityActivityWrite.create({
      tenantId: "tenant_1",
      entityType: "customer",
      entityId: "cust_1",
      activityType: "call",
      subject: "Discovery call",
      actorUserId: "user_1",
    });

    const aggregator = new Customer360Aggregator({ ports });
    const aggregate = await aggregator.aggregate({ customerId: "cust_1" }, createContext({
      tenantId: "tenant_1",
      actorId: "user_1",
      permissions: ["*"],
    }));

    assert.ok(aggregate);
    assert.equal(aggregate!.tags.length, 1);
    assert.equal(aggregate!.contacts.length, 1);
    assert.equal(aggregate!.activities.total, 1);
  });
});
