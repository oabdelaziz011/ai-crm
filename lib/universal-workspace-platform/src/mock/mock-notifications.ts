import type { WorkspaceNotification } from "../types/notification-types.js";

const now = Date.now();
const mins = (m: number) => new Date(now - m * 60_000).toISOString();

export const MOCK_NOTIFICATIONS: WorkspaceNotification[] = [
  { id: "n1", category: "vip", title: "VIP Arrived", message: "Sara Hassan checked in — Room 3", priority: "high", read: false, createdAt: mins(2), actionKey: "open_customer", entityType: "customer", entityId: "c1" },
  { id: "n2", category: "payment", title: "Payment Received", message: "$80.00 partial payment from Ahmed Al-Rashid", priority: "normal", read: false, createdAt: mins(8), actionKey: "view_payment" },
  { id: "n3", category: "invoice", title: "Invoice Overdue", message: "INV-2026-0831 is 5 days overdue ($340)", priority: "urgent", read: false, createdAt: mins(15), actionKey: "view_invoice" },
  { id: "n4", category: "employee", title: "Employee Late", message: "Dr. Khalid is 12 minutes late for shift", priority: "high", read: true, createdAt: mins(22), actionKey: "view_schedule" },
  { id: "n5", category: "task", title: "Task Completed", message: "Lab results uploaded for Sara Hassan", priority: "low", read: true, createdAt: mins(45), actionKey: "view_task" },
  { id: "n6", category: "room", title: "Room Available", message: "Room 5 is now available", priority: "normal", read: false, createdAt: mins(3), actionKey: "assign_room" },
  { id: "n7", category: "ai", title: "AI Recommendation", message: "Collect remaining $45 from Sara Hassan (94% confidence)", priority: "normal", read: false, createdAt: mins(5), actionKey: "ai_recommendation" },
  { id: "n8", category: "workflow", title: "Workflow Blocked", message: "Insurance verification pending for BK-9912", priority: "high", read: true, createdAt: mins(60), actionKey: "view_workflow" },
];
