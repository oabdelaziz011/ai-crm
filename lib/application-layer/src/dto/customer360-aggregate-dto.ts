import type { TimelineItemDto } from "./query-dtos.js";

export type Customer360IdentityDto = Readonly<{
  customerId: string;
  tenantId: string;
  displayName: string;
}>;

export type Customer360ProfileDto = Readonly<{
  email: string | null;
  phone: string | null;
  company: string | null;
  birthday: string | null;
  avatarColor: string;
  healthScore: number;
  customerSince: string;
  notes: string | null;
}>;

export type Customer360ContactDto = Readonly<{
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  isPrimary: boolean;
}>;

export type Customer360AddressDto = Readonly<{
  id: string;
  label: string | null;
  line1: string;
  line2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
  isPrimary: boolean;
}>;

export type Customer360TagDto = Readonly<{
  id: string;
  label: string;
}>;

export type Customer360CustomFieldDto = Readonly<{
  key: string;
  label: string;
  value: string;
}>;

export type Customer360LeadDto = Readonly<{
  id: string;
  source: string;
  campaign: string | null;
  owner: string;
  score: number;
  customFields: Readonly<Record<string, string>>;
  convertedAt: string | null;
}>;

export type Customer360SummaryDto = Readonly<{
  isVip: boolean;
  outstandingBalanceCents: number;
  currentStatus: string;
  currentPaymentStatus: string;
  assignedResource: string | null;
  priority: string;
  totalVisits: number;
  totalRevenueCents: number;
  lifetimeValueCents: number;
  lastVisit: string | null;
}>;

export type Customer360TimelineSummaryDto = Readonly<{
  total: number;
  recent: readonly TimelineItemDto[];
}>;

export type Customer360ActivitiesSummaryDto = Readonly<{
  total: number;
  channels: readonly string[];
  recent: readonly Customer360ActivityItemDto[];
}>;

export type Customer360ActivityItemDto = Readonly<{
  id: string;
  channel: string;
  subject: string;
  occurredAt: string;
  direction?: string;
  preview?: string;
  actor?: string;
}>;

export type Customer360NoteDto = Readonly<{
  id: string;
  body: string;
  author: string;
  createdAt: string;
  pinned: boolean;
  isPrivate: boolean;
  mentions: readonly string[];
  hasAttachments: boolean;
}>;

export type Customer360FileDto = Readonly<{
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  previewUrl: string | null;
}>;

export type Customer360TaskDto = Readonly<{
  id: string;
  title: string;
  dueAt: string | null;
  status: string;
  assignee: string;
}>;

export type Customer360BookingSummaryDto = Readonly<{
  total: number;
  upcoming: number;
  items: readonly Customer360BookingItemDto[];
}>;

export type Customer360BookingItemDto = Readonly<{
  id: string;
  service: string;
  resource: string;
  scheduledAt: string;
  status: string;
  paymentStatus: string;
}>;

export type Customer360InvoiceSummaryDto = Readonly<{
  total: number;
  outstandingCents: number;
  items: readonly Customer360InvoiceItemDto[];
}>;

export type Customer360InvoiceItemDto = Readonly<{
  id: string;
  number: string;
  amountCents: number;
  status: string;
  issuedAt: string;
}>;

export type Customer360PaymentSummaryDto = Readonly<{
  total: number;
  totalCents: number;
  items: readonly Customer360PaymentItemDto[];
}>;

export type Customer360PaymentItemDto = Readonly<{
  id: string;
  method: string;
  amountCents: number;
  paidAt: string;
}>;

export type Customer360AiContextDto = Readonly<{
  healthScore: number;
  riskLevel: "low" | "medium" | "high";
  insights: readonly Customer360AiInsightDto[];
}>;

export type Customer360AiInsightDto = Readonly<{
  id: string;
  kind: string;
  title: string;
  body: string;
  confidence: number;
}>;

export type Customer360WorkspaceMetadataDto = Readonly<{
  templateKey: string;
  generatedAt: string;
  correlationId: string;
}>;

export type Customer360RoleMetadataDto = Readonly<{
  role: string;
  visibleSections: readonly string[];
}>;

/** Immutable Customer360 aggregate — aggregation only, no UI logic. */
export type Customer360AggregateDto = Readonly<{
  identity: Customer360IdentityDto;
  profile: Customer360ProfileDto;
  contacts: readonly Customer360ContactDto[];
  addresses: readonly Customer360AddressDto[];
  tags: readonly Customer360TagDto[];
  customFields: readonly Customer360CustomFieldDto[];
  lead: Customer360LeadDto | null;
  summary: Customer360SummaryDto;
  timeline: Customer360TimelineSummaryDto;
  activities: Customer360ActivitiesSummaryDto;
  notes: readonly Customer360NoteDto[];
  files: readonly Customer360FileDto[];
  tasks: readonly Customer360TaskDto[];
  bookings: Customer360BookingSummaryDto;
  invoices: Customer360InvoiceSummaryDto;
  payments: Customer360PaymentSummaryDto;
  aiContext: Customer360AiContextDto;
  workspace: Customer360WorkspaceMetadataDto;
  role: Customer360RoleMetadataDto;
  warnings: readonly string[];
  telemetry: Readonly<{
    durationMs: number;
    repositoryCalls: number;
    cacheHits: number;
    failures: number;
  }>;
}>;
