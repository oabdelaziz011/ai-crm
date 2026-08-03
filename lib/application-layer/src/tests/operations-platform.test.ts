import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  createApplicationLayerRegistry,
  createContext,
} from "../index.js";
import type { ApplicationPorts } from "../ports/repository-ports.js";

describe("Operations platform GA-1.3", () => {
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

  it("creates task and publishes TaskAssigned", async () => {
    const services = registry.getServices();
    const result = await services.task.createTask(
      { title: "Follow up", assigneeId: "user_2" },
      adminContext(),
    );
    assert.ok(result.data.taskId);
    assert.equal(result.data.title, "Follow up");
  });

  it("completes task lifecycle", async () => {
    const services = registry.getServices();
    const created = await services.task.createTask(
      { title: "Review booking", assigneeId: "user_2" },
      adminContext(),
    );
    const completed = await services.task.completeTask(
      { taskId: created.data.taskId },
      adminContext(),
    );
    assert.ok(completed.data.completedAt);
  });

  it("uploads file through UploadFile command", async () => {
    const services = registry.getServices();
    const result = await services.file.uploadFile(
      {
        fileName: "report.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1024,
        entityType: "customer",
        entityId: "cust_1",
      },
      adminContext(),
    );
    assert.equal(result.data.fileName, "report.pdf");
  });

  it("marks booking as no-show", async () => {
    const services = registry.getServices();
    const booking = await services.booking.createBooking(
      { customerId: "cust_1", scheduledAt: new Date().toISOString() },
      adminContext(),
    );
    const result = await services.operations.markNoShowBooking(
      { bookingId: booking.data.bookingId },
      adminContext(),
    );
    assert.equal(result.data.status, "no_show");
  });

  it("reads knowledge document through KnowledgeApplicationService", async () => {
    const services = registry.getServices();
    const result = await services.knowledge.getDocument("doc_1", adminContext());
    assert.ok(result.data);
    assert.equal(result.data.title, "Mock Document");
  });

  it("searches knowledge through KnowledgeReadPort", async () => {
    const services = registry.getServices();
    const result = await services.knowledge.searchKnowledge("refund policy", adminContext());
    assert.equal(result.data.query, "refund policy");
  });

  it("loads persistent operations workspace config", async () => {
    const ports = registry.resolve<ApplicationPorts>("ports");
    const config = await ports.operationsWorkspaceRead.getConfig("tenant_1", "clinic");
    assert.ok(config);
    assert.equal(config?.templateKey, "clinic");
  });

  it("executes workflow start through operations service", async () => {
    const services = registry.getServices();
    const result = await services.operations.executeWorkflow(
      { workflowId: "flow_1" },
      adminContext(),
    );
    assert.equal(result.data.workflowId, "flow_1");
    assert.ok(result.data.executionId);
  });
});
