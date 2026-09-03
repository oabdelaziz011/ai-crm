export type OperationsMockCustomer = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  address: string | null;
  birthday: string | null;
  tags: string[];
  healthScore: number;
  avatarColor: string;
};

export type OperationsMockLead = {
  id: string;
  source: string | null;
  campaign: string | null;
  owner: string | null;
  score: number;
  customFields: Record<string, string>;
  convertedAt: string | null;
};

export type OperationsMockTimelineEntry = {
  id: string;
  type: string;
  title: string;
  summary: string;
  occurredAt: string;
  actor: string | null;
  icon: string;
};

export type OperationsMockBooking = {
  id: string;
  service: string;
  resource: string;
  scheduledAt: string;
  status: string;
  paymentStatus: string;
};

export type OperationsMockInvoice = {
  id: string;
  number: string;
  amountCents: number;
  status: string;
  issuedAt: string;
};

export type OperationsMockPayment = {
  id: string;
  method: string;
  amountCents: number;
  paidAt: string;
};

export type OperationsMockActivity = {
  id: string;
  channel: string;
  subject: string;
  occurredAt: string;
};

export type OperationsMockFile = {
  id: string;
  name: string;
  type: string;
  sizeKb: number;
  uploadedAt: string;
};

export type OperationsMockNote = {
  id: string;
  body: string;
  author: string;
  createdAt: string;
  internal: boolean;
};

export type OperationsMockTask = {
  id: string;
  title: string;
  dueAt: string;
  status: string;
  assignee: string;
};

export type OperationsMockAiInsight = {
  id: string;
  kind: string;
  title: string;
  body: string;
  confidence: number;
};

export type OperationsCustomerWorkspaceData = {
  customer: OperationsMockCustomer;
  lead: OperationsMockLead | null;
  timeline: OperationsMockTimelineEntry[];
  bookings: OperationsMockBooking[];
  invoices: OperationsMockInvoice[];
  payments: OperationsMockPayment[];
  activities: OperationsMockActivity[];
  files: OperationsMockFile[];
  notes: OperationsMockNote[];
  tasks: OperationsMockTask[];
  aiInsights: OperationsMockAiInsight[];
  outstandingBalanceCents: number;
  currentStatus: string;
  currentPaymentStatus: string;
  assignedResource: string | null;
  priority: string;
};
