import type { ActivityEvent } from "../types/activity-types.js";

const now = Date.now();
const mins = (m: number) => new Date(now - m * 60_000).toISOString();
const hours = (h: number) => new Date(now - h * 3_600_000).toISOString();
const days = (d: number) => new Date(now - d * 86_400_000).toISOString();

export const MOCK_ACTIVITY_EVENTS: ActivityEvent[] = [
  { id: "a1", type: "customer_created", title: "Customer Created", description: "New customer Ahmed Al-Rashid registered", actor: "Reception · Layla", occurredAt: mins(12), period: "today", icon: "UserPlus" },
  { id: "a2", type: "lead_converted", title: "Lead Converted", description: "Fatima Noor converted to customer", actor: "Sales · Omar", occurredAt: mins(35), period: "today", icon: "ArrowRightCircle" },
  { id: "a3", type: "payment_collected", title: "Payment Collected", description: "$80.00 partial payment received", actor: "Cashier · Nadia", occurredAt: mins(48), period: "today", icon: "CreditCard" },
  { id: "a4", type: "whatsapp_sent", title: "WhatsApp Sent", description: "Appointment reminder sent to Sara Hassan", actor: "System", occurredAt: hours(2), period: "today", icon: "MessageCircle" },
  { id: "a5", type: "employee_assigned", title: "Employee Assigned", description: "Dr. Amira assigned to Sara Hassan", actor: "Manager · Khalid", occurredAt: hours(3), period: "today", icon: "UserCheck" },
  { id: "a6", type: "invoice_generated", title: "Invoice Generated", description: "INV-2026-0847 created ($245.00)", actor: "Billing · System", occurredAt: hours(5), period: "today", icon: "FileText" },
  { id: "a7", type: "task_completed", title: "Task Completed", description: "Lab results uploaded for Sara Hassan", actor: "Nurse · Hana", occurredAt: hours(8), period: "today", icon: "CheckCircle2" },
  { id: "a8", type: "ai_summary", title: "AI Summary Generated", description: "Customer health summary for Sara Hassan", actor: "AI Copilot", occurredAt: hours(10), period: "today", icon: "Sparkles" },
  { id: "a9", type: "workflow_triggered", title: "Workflow Triggered", description: "Insurance verification started for BK-9912", actor: "Automation", occurredAt: hours(20), period: "yesterday", icon: "Workflow" },
  { id: "a10", type: "payment_collected", title: "Payment Collected", description: "$120.00 full payment received", actor: "Cashier · Nadia", occurredAt: days(2), period: "this_week", icon: "CreditCard" },
  { id: "a11", type: "customer_created", title: "Customer Created", description: "New customer Layla Mansour registered", actor: "Reception", occurredAt: days(5), period: "older", icon: "UserPlus" },
];
