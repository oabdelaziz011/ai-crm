import type { OperationsRow } from "../types/row-types.js";
import { getMockWorkspaceConfig } from "./mock-workspace-config.js";

const FIRST_NAMES = ["Sara", "Ahmed", "Layla", "Youssef", "Nour", "Karim", "Maya", "Hassan", "Dina", "Omar"];
const LAST_NAMES = ["Hassan", "Ali", "Mahmoud", "Farid", "Nasser", "Saleh", "Ibrahim", "Kamal", "Rashid", "Zaki"];
const SERVICES = ["Consultation", "Follow-up", "Lab Review", "Physical Therapy", "Dental Cleaning"];
const RESOURCES = ["Dr. Amira Hassan", "Dr. Omar Khalil", "Room 1"];
const BRANCHES = ["Main Branch", "North Clinic", "Downtown"];
const STATUSES = ["st_booked", "st_confirmed", "st_checked_in", "st_in_progress", "st_completed"];
const PAYMENTS = ["pay_pending", "pay_partial", "pay_paid", "pay_refunded"];

function pick<T>(items: T[], index: number): T {
  return items[index % items.length]!;
}

function pad(n: number): string {
  return String(n).padStart(4, "0");
}

export function generateMockRows(count = 120, companyId = "mock-company"): OperationsRow[] {
  const config = getMockWorkspaceConfig();
  const rows: OperationsRow[] = [];
  const base = new Date();
  base.setHours(8, 0, 0, 0);

  for (let i = 0; i < count; i += 1) {
    const first = pick(FIRST_NAMES, i);
    const last = pick(LAST_NAMES, i + 3);
    const scheduled = new Date(base.getTime() + i * 18 * 60_000);
    const statusId = pick(STATUSES, i);
    const paymentStatusId = pick(PAYMENTS, i + 1);

    rows.push({
      id: `row_${i + 1}`,
      companyId,
      customerId: `cust_${i + 1}`,
      leadId: i % 5 === 0 ? `lead_${i + 1}` : null,
      statusId,
      paymentStatusId,
      assignedResourceId: i % 3 === 0 ? "res_dr_a" : "res_dr_b",
      priority: i % 11 === 0 ? "urgent" : i % 7 === 0 ? "high" : "normal",
      tags: i % 4 === 0 ? ["VIP", "Returning"] : i % 3 === 0 ? ["New"] : [],
      values: {
        reference: `OP-${pad(i + 1)}`,
        customer: `${first} ${last}`,
        phone: `+971 50 ${String(100 + (i % 900)).padStart(3, "0")} ${String(1000 + i).slice(-4)}`,
        service: pick(SERVICES, i),
        resource: pick(RESOURCES, i),
        status: config.statuses.find((s) => s.id === statusId)?.displayName ?? statusId,
        payment_status: config.paymentStatuses.find((p) => p.id === paymentStatusId)?.displayName ?? paymentStatusId,
        visit_type: pick(["New", "FollowUp", "Consultation", "Emergency", "VIP"], i),
        scheduled_at: scheduled.toISOString(),
        appointment_time: scheduled.toISOString(),
        waiting_minutes: statusId === "st_checked_in" ? 5 + (i % 25) : 0,
        amount: 8000 + (i % 12) * 1500,
        currency: "EGP",
        tags: i % 4 === 0 ? "VIP, Returning" : "",
        branch: pick(BRANCHES, i),
      },
      createdAt: new Date(scheduled.getTime() - 86_400_000).toISOString(),
      updatedAt: scheduled.toISOString(),
    });
  }

  return rows;
}

export const MOCK_QUEUE_ROWS = generateMockRows(120);
