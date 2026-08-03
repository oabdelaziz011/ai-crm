import type { OperationsCustomer360WorkspaceData } from "../types/customer360-panel-types.js";
import type { OperationsRow } from "../types/row-types.js";

export function buildMockCustomer360Workspace(
  rowId: string,
  customerName: string,
  row?: OperationsRow | null,
): OperationsCustomer360WorkspaceData {
  const now = Date.now();
  const scheduledAt = row?.values.scheduled_at
    ? String(row.values.scheduled_at)
    : new Date(now + 3_600_000).toISOString();

  return {
    customer: {
      id: `cust_${rowId}`,
      name: customerName,
      email: `${customerName.split(" ")[0]?.toLowerCase()}@example.com`,
      phone: String(row?.values.phone ?? "+971 50 123 4567"),
      company: "Acme Holdings",
      address: "Dubai Marina, UAE",
      birthday: "1990-05-12",
      tags: ["VIP", "Returning"],
      healthScore: 82,
      avatarColor: "#6366f1",
    },
    lead: {
      id: "lead_001",
      source: "Website Form",
      campaign: "Spring Promo",
      owner: "Sales Team A",
      score: 78,
      customFields: { industry: "Healthcare", budget: "High" },
      convertedAt: new Date(now - 7 * 86_400_000).toISOString(),
    },
    todaysOperation: {
      id: rowId,
      reference: String(row?.values.reference ?? `OP-${rowId}`),
      service: String(row?.values.service ?? "Consultation"),
      status: String(row?.values.status ?? "Checked In"),
      assignedEmployee: String(row?.values.resource ?? "Dr. Amira Hassan"),
      branch: String(row?.values.branch ?? "Main Branch"),
      room: "Room 3",
      durationMinutes: 30,
      scheduledAt,
      arrivalAt: new Date(now - 45 * 60_000).toISOString(),
      checkInAt: new Date(now - 30 * 60_000).toISOString(),
      checkOutAt: null,
      countdownMinutes: 18,
      paymentStatus: String(row?.values.payment_status ?? "Partial"),
      paymentAmountCents: Number(row?.values.amount ?? 15000),
    },
    summary: {
      photoUrl: null,
      isVip: true,
      customerSince: "2022-03-14",
      lastVisit: new Date(now - 42 * 86_400_000).toISOString(),
      totalVisits: 24,
      totalRevenueCents: 186_500,
      lifetimeValueCents: 224_000,
      preferredEmployee: "Dr. Amira Hassan",
      preferredTime: "Morning (9–11 AM)",
      preferredService: "Consultation",
      riskLevel: "low",
      satisfaction: 4.7,
      aiHealthScore: 82,
    },
    communications: [
      { id: "com_1", channel: "whatsapp", direction: "outbound", preview: "Your appointment is confirmed for today at 10:30 AM.", occurredAt: new Date(now - 2 * 86_400_000).toISOString(), actor: "Reception" },
      { id: "com_2", channel: "call", direction: "inbound", preview: "Customer called to confirm parking instructions.", occurredAt: new Date(now - 86_400_000).toISOString(), actor: "Reception" },
      { id: "com_3", channel: "email", direction: "outbound", preview: "Invoice INV-2026-0142 attached.", occurredAt: new Date(now - 3_600_000).toISOString(), actor: "System" },
      { id: "com_4", channel: "sms", direction: "outbound", preview: "Reminder: Please arrive 10 minutes early.", occurredAt: new Date(now - 1_800_000).toISOString(), actor: "Automation" },
      { id: "com_5", channel: "internal", direction: "outbound", preview: "Allergic to penicillin — flagged for nurse.", occurredAt: new Date(now - 900_000).toISOString(), actor: "Dr. Amira" },
      { id: "com_6", channel: "voice_note", direction: "inbound", preview: "Voice note: Running 5 min late.", occurredAt: new Date(now - 600_000).toISOString(), actor: "Customer" },
    ],
    timeline: [
      { id: "tl_1", type: "lead_created", title: "Lead Created", summary: "Submitted website inquiry form", occurredAt: new Date(now - 14 * 86_400_000).toISOString(), actor: "System", icon: "UserPlus" },
      { id: "tl_2", type: "customer_created", title: "Customer Created", summary: "Converted from lead", occurredAt: new Date(now - 7 * 86_400_000).toISOString(), actor: "Sales", icon: "UserCheck" },
      { id: "tl_3", type: "appointment", title: "Appointment Booked", summary: "Consultation scheduled", occurredAt: new Date(now - 1 * 86_400_000).toISOString(), actor: "Reception", icon: "Calendar" },
      { id: "tl_4", type: "status_changed", title: "Checked In", summary: "Arrived and checked in at front desk", occurredAt: new Date(now - 30 * 60_000).toISOString(), actor: "Reception", icon: "LogIn" },
      { id: "tl_5", type: "invoice", title: "Invoice Issued", summary: "INV-2026-0142 for $150.00", occurredAt: new Date(now - 86_400_000).toISOString(), actor: "System", icon: "FileText" },
      { id: "tl_6", type: "payment", title: "Payment Received", summary: "Partial payment $75.00 via card", occurredAt: new Date(now - 3_600_000).toISOString(), actor: "Cashier", icon: "CreditCard" },
      { id: "tl_7", type: "whatsapp", title: "WhatsApp", summary: "Confirmed appointment time", occurredAt: new Date(now - 2 * 86_400_000).toISOString(), actor: "Reception", icon: "MessageCircle" },
      { id: "tl_8", type: "task", title: "Task Created", summary: "Send lab results", occurredAt: new Date(now - 1_800_000).toISOString(), actor: "Dr. Amira", icon: "CheckSquare" },
      { id: "tl_9", type: "ai_summary", title: "AI Summary", summary: "High engagement, upsell opportunity detected", occurredAt: new Date(now - 900_000).toISOString(), actor: "AI", icon: "Sparkles" },
      { id: "tl_10", type: "file", title: "File Uploaded", summary: "Insurance Card.pdf", occurredAt: new Date(now - 5 * 86_400_000).toISOString(), actor: "Reception", icon: "Paperclip" },
    ],
    bookings: [
      { id: "bk_today", service: String(row?.values.service ?? "Consultation"), resource: String(row?.values.resource ?? "Dr. Amira Hassan"), scheduledAt, status: "Checked In", paymentStatus: "Partial" },
      { id: "bk_2", service: "Follow-up", resource: "Dr. Omar Khalil", scheduledAt: new Date(now + 14 * 86_400_000).toISOString(), status: "Confirmed", paymentStatus: "Unpaid" },
      { id: "bk_3", service: "Lab Review", resource: "Room 1", scheduledAt: new Date(now - 30 * 86_400_000).toISOString(), status: "Completed", paymentStatus: "Paid" },
      { id: "bk_4", service: "Consultation", resource: "Dr. Amira Hassan", scheduledAt: new Date(now - 60 * 86_400_000).toISOString(), status: "No Show", paymentStatus: "Unpaid" },
      { id: "bk_5", service: "Physical Therapy", resource: "Room 2", scheduledAt: new Date(now - 90 * 86_400_000).toISOString(), status: "Cancelled", paymentStatus: "Refunded" },
    ],
    invoices: [
      { id: "inv_1", number: "INV-2026-0142", amountCents: 15000, status: "Outstanding", issuedAt: new Date(now - 86_400_000).toISOString() },
      { id: "inv_2", number: "INV-2026-0098", amountCents: 8000, status: "Paid", issuedAt: new Date(now - 30 * 86_400_000).toISOString() },
    ],
    payments: [
      { id: "pay_1", method: "Card", amountCents: 7500, paidAt: new Date(now - 3_600_000).toISOString() },
      { id: "pay_2", method: "Cash", amountCents: 8000, paidAt: new Date(now - 30 * 86_400_000).toISOString() },
    ],
    activities: [
      { id: "act_1", channel: "Phone", subject: "Appointment confirmation call", occurredAt: new Date(now - 2 * 86_400_000).toISOString() },
      { id: "act_2", channel: "WhatsApp", subject: "Sent pre-visit instructions", occurredAt: new Date(now - 86_400_000).toISOString() },
    ],
    files: [
      { id: "file_1", name: "Insurance Card.pdf", type: "pdf", sizeKb: 420, uploadedAt: new Date(now - 5 * 86_400_000).toISOString() },
      { id: "file_2", name: "ID Scan.jpg", type: "image", sizeKb: 890, uploadedAt: new Date(now - 5 * 86_400_000).toISOString() },
      { id: "file_3", name: "Consent Form.pdf", type: "pdf", sizeKb: 210, uploadedAt: new Date(now - 30 * 86_400_000).toISOString() },
      { id: "file_4", name: "Lab Results.pdf", type: "medical", sizeKb: 1560, uploadedAt: new Date(now - 14 * 86_400_000).toISOString() },
    ],
    notes: [
      { id: "note_1", body: "Prefers morning appointments. Allergic to penicillin.", author: "Dr. Amira Hassan", createdAt: new Date(now - 1_800_000).toISOString(), internal: true },
      { id: "note_2", body: "Requested Arabic-speaking staff when available.", author: "Reception", createdAt: new Date(now - 86_400_000).toISOString(), internal: true },
    ],
    notesExtended: [
      { id: "note_1", body: "Prefers morning appointments. Allergic to penicillin.", author: "Dr. Amira Hassan", createdAt: new Date(now - 1_800_000).toISOString(), pinned: true, isPrivate: true, mentions: ["@nurse"], hasAttachments: false },
      { id: "note_2", body: "Requested Arabic-speaking staff when available.", author: "Reception", createdAt: new Date(now - 86_400_000).toISOString(), pinned: false, isPrivate: false, mentions: [], hasAttachments: false },
    ],
    tasks: [
      { id: "task_1", title: "Send lab results", dueAt: new Date(now + 86_400_000).toISOString(), status: "Open", assignee: "Lab Team" },
      { id: "task_2", title: "Follow-up call", dueAt: new Date(now - 86_400_000).toISOString(), status: "Overdue", assignee: "Reception" },
      { id: "task_3", title: "Verify insurance", dueAt: new Date(now - 2 * 86_400_000).toISOString(), status: "Completed", assignee: "Reception" },
    ],
    aiInsights: [
      { id: "ai_1", kind: "summary", title: "Customer Summary", body: "Long-term patient with high satisfaction. Regular consultation cadence every 6 weeks.", confidence: 0.92 },
      { id: "ai_2", kind: "risk", title: "Risk Analysis", body: "Low churn risk. Outstanding balance is minor and historically paid on time.", confidence: 0.88 },
      { id: "ai_3", kind: "next_action", title: "Next Best Action", body: "Offer follow-up package and schedule next visit before departure.", confidence: 0.85 },
    ],
    aiActions: [
      { id: "aa_1", actionKey: "summarize", labelKey: "actions.summarize", description: "Generate a concise customer summary", requiresConfirmation: true },
      { id: "aa_2", actionKey: "next_action", labelKey: "actions.nextAction", description: "Suggest the best next step", requiresConfirmation: true },
      { id: "aa_3", actionKey: "predict_cancel", labelKey: "actions.predictCancel", description: "Estimate cancellation probability", requiresConfirmation: true },
      { id: "aa_4", actionKey: "upsell", labelKey: "actions.upsell", description: "Identify upsell opportunities", requiresConfirmation: true },
      { id: "aa_5", actionKey: "health", labelKey: "actions.health", description: "Analyze customer health score", requiresConfirmation: true },
      { id: "aa_6", actionKey: "payment_risk", labelKey: "actions.paymentRisk", description: "Assess payment risk", requiresConfirmation: true },
      { id: "aa_7", actionKey: "conversation_summary", labelKey: "actions.conversationSummary", description: "Summarize recent conversations", requiresConfirmation: true },
      { id: "aa_8", actionKey: "follow_up", labelKey: "actions.followUp", description: "Draft a follow-up message", requiresConfirmation: true },
      { id: "aa_9", actionKey: "whatsapp", labelKey: "actions.generateWhatsapp", description: "Generate WhatsApp message draft", requiresConfirmation: true },
      { id: "aa_10", actionKey: "email", labelKey: "actions.generateEmail", description: "Generate email draft", requiresConfirmation: true },
    ],
    outstandingBalanceCents: 7500,
    currentStatus: String(row?.values.status ?? "Checked In"),
    currentPaymentStatus: String(row?.values.payment_status ?? "Partial"),
    assignedResource: String(row?.values.resource ?? "Dr. Amira Hassan"),
    priority: "Normal",
  };
}

/** @deprecated Use buildMockCustomer360Workspace */
export function buildMockCustomerWorkspace(rowId: string, customerName: string) {
  return buildMockCustomer360Workspace(rowId, customerName);
}
