import type { OperationsCustomerWorkspaceData } from "./panel-types.js";

export type OperationsMockTodaysOperation = {
  id: string;
  reference: string;
  service: string;
  status: string;
  assignedEmployee: string;
  branch: string;
  room: string;
  durationMinutes: number;
  scheduledAt: string;
  arrivalAt: string | null;
  checkInAt: string | null;
  checkOutAt: string | null;
  countdownMinutes: number;
  paymentStatus: string;
  paymentAmountCents: number;
};

export type OperationsMockCustomerSummary = {
  photoUrl: string | null;
  isVip: boolean;
  customerSince: string;
  lastVisit: string;
  totalVisits: number;
  totalRevenueCents: number;
  lifetimeValueCents: number;
  preferredEmployee: string;
  preferredTime: string;
  preferredService: string;
  riskLevel: "low" | "medium" | "high";
  satisfaction: number;
  aiHealthScore: number;
};

export type OperationsMockCommunicationItem = {
  id: string;
  channel: "whatsapp" | "call" | "sms" | "email" | "internal" | "voice_note";
  direction: "inbound" | "outbound";
  preview: string;
  occurredAt: string;
  actor: string;
};

export type OperationsMockNoteExtended = {
  id: string;
  body: string;
  author: string;
  createdAt: string;
  pinned: boolean;
  isPrivate: boolean;
  mentions: string[];
  hasAttachments: boolean;
};

export type OperationsMockAiAction = {
  id: string;
  actionKey: string;
  labelKey: string;
  description: string;
  requiresConfirmation: true;
};

export type OperationsCustomer360WorkspaceData = OperationsCustomerWorkspaceData & {
  todaysOperation: OperationsMockTodaysOperation;
  summary: OperationsMockCustomerSummary;
  communications: OperationsMockCommunicationItem[];
  notesExtended: OperationsMockNoteExtended[];
  aiActions: OperationsMockAiAction[];
};
