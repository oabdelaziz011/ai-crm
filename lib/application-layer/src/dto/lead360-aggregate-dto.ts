import type { TimelineItemDto } from "./query-dtos.js";

export type Lead360IdentityDto = Readonly<{
  leadId: string;
  tenantId: string;
  title: string;
  contactName: string;
}>;

export type Lead360ProfileDto = Readonly<{
  email: string | null;
  phone: string | null;
  companyName: string | null;
  lifecycleStatus: string;
  stageId: string;
  stageName: string | null;
  pipelineId: string;
  pipelineName: string | null;
  priority: string;
  score: number;
  scoreBand: "cold" | "warm" | "hot";
  estimatedValue: number | null;
  currency: string;
  isQualified: boolean;
  assignedUserId: string | null;
  ownerName: string | null;
  sourceName: string | null;
  customerId: string | null;
  conversationId: string | null;
  createdAt: string;
  updatedAt: string;
  aiSummary: string | null;
}>;

export type Lead360ContactDto = Readonly<{
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  isPrimary: boolean;
}>;

export type Lead360TagDto = Readonly<{
  id: string;
  label: string;
  color: string | null;
}>;

export type Lead360CustomFieldDto = Readonly<{
  key: string;
  label: string;
  value: string;
  fieldType: string;
}>;

export type Lead360ActivityItemDto = Readonly<{
  id: string;
  channel: string;
  subject: string;
  occurredAt: string;
  preview: string | null;
  actor: string | null;
  outcome: string | null;
}>;

export type Lead360FileDto = Readonly<{
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  previewUrl: string | null;
}>;

export type Lead360TaskDto = Readonly<{
  id: string;
  title: string;
  dueAt: string | null;
  status: string;
  assignee: string;
}>;

export type Lead360RelatedEntityDto = Readonly<{
  id: string;
  entityType: string;
  entityId: string;
  label: string;
  relationType: string;
}>;

export type Lead360IntelligenceDto = Readonly<{
  summary: string | null;
  nextBestAction: string | null;
  suggestedFollowUp: string | null;
  healthLabel: string;
  scoreExplanation: string | null;
  recommendedStage: string | null;
}>;

export type Lead360TimelineSummaryDto = Readonly<{
  total: number;
  recent: readonly TimelineItemDto[];
}>;

export type Lead360ActivitiesSummaryDto = Readonly<{
  total: number;
  channels: readonly string[];
  recent: readonly Lead360ActivityItemDto[];
}>;

export type Lead360AggregateDto = Readonly<{
  identity: Lead360IdentityDto;
  profile: Lead360ProfileDto;
  contacts: readonly Lead360ContactDto[];
  tags: readonly Lead360TagDto[];
  customFields: readonly Lead360CustomFieldDto[];
  timeline: Lead360TimelineSummaryDto;
  activities: Lead360ActivitiesSummaryDto;
  files: readonly Lead360FileDto[];
  tasks: readonly Lead360TaskDto[];
  relatedEntities: readonly Lead360RelatedEntityDto[];
  intelligence: Lead360IntelligenceDto;
  riskLevel: "low" | "medium" | "high";
}>;

export type Lead360AggregateRequestDto = Readonly<{
  leadId: string;
  pipelineId?: string;
  role?: string;
  visibleSections?: readonly string[];
}>;
