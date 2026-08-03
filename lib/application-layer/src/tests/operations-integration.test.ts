import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  createApplicationLayerRegistry,
  createContext,
} from "../index.js";

describe("Operations commands integration", () => {
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

  it("executes CheckInCustomer through operations service", async () => {
    const services = registry.getServices();
    const booking = await services.booking.createBooking(
      { customerId: "cust_1", scheduledAt: new Date().toISOString() },
      adminContext(),
    );
    const result = await services.operations.checkInCustomer({ bookingId: booking.data.bookingId }, adminContext());
    assert.equal(result.data.status, "Checked In");
  });

  it("executes AssignEmployee through operations service", async () => {
    const services = registry.getServices();
    const booking = await services.booking.createBooking(
      { customerId: "cust_1", scheduledAt: new Date().toISOString() },
      adminContext(),
    );
    const result = await services.operations.assignEmployee(
      { bookingId: booking.data.bookingId, employeeId: "emp_2" },
      adminContext(),
    );
    assert.equal(result.data.employeeId, "emp_2");
  });

  it("paginates operations queue with correct total", async () => {
    const services = registry.getServices();
    const result = await services.operations.getQueue({ page: 1, pageSize: 1 }, adminContext());
    assert.ok(result.data.total >= 1);
    assert.equal(result.data.rows.length, 1);
    assert.equal(result.data.hasMore, result.data.total > 1);
  });
});
