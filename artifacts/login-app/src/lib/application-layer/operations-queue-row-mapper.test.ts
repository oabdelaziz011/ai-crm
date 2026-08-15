import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getMockWorkspaceConfig } from "@workspace/universal-operations-engine";
import { mapOperationsBookingToRow } from "./operations-queue-row-mapper.js";
import type { OperationsBookingView } from "@/lib/scheduling/operations/types";

describe("operations queue row mapper", () => {
  it("maps live booking to OperationsRow with snapshot amount and visit type", () => {
    const config = getMockWorkspaceConfig("clinic");
    const booking: OperationsBookingView = {
      id: "bk_12345678",
      companyId: "co_1",
      branchId: "br_1",
      customerId: "cust_1",
      resourceId: "res_1",
      serviceId: "svc_1",
      startAt: new Date().toISOString(),
      endAt: new Date(Date.now() + 3_600_000).toISOString(),
      timezone: "UTC",
      status: "checked_in",
      notes: null,
      createdBy: "user_1",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      customer: { id: "cust_1", name: "Sara Hassan", phone: "+971501234567", email: "sara@example.com" },
      service: { id: "svc_1", name: "Consultation", durationMinutes: 30, priceCents: 99999, currency: "USD" },
      resource: { id: "res_1", name: "Dr. Amira", type: "doctor" },
      branch: { id: "br_1", name: "Main Branch" },
      paymentStatus: "partial",
      amountCents: 30000,
      currency: "EGP",
      visitType: "FollowUp",
      discountCents: 0,
      taxCents: 0,
      confirmationNumber: "BK-000123",
      displayStart: "10:00",
      displayEnd: "10:30",
      durationMinutes: 30,
    };

    const row = mapOperationsBookingToRow(booking, config);
    assert.equal(row.values.reference, "BK-000123");
    assert.equal(row.id, "bk_12345678");
    assert.equal(row.customerId, "cust_1");
    assert.equal(row.statusId, "st_checked_in");
    assert.equal(row.values.customer, "Sara Hassan");
    assert.equal(row.values.service, "Consultation");
    assert.equal(row.values.amount, 30000);
    assert.equal(row.values.currency, "EGP");
    assert.equal(row.values.visit_type, "FollowUp");
    assert.notEqual(row.values.amount, booking.service?.priceCents);
  });
});
