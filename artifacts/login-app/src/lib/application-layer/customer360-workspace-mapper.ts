import type { Customer360AggregateDto } from "@workspace/application-layer";
import type { OperationsCustomer360WorkspaceData } from "@workspace/universal-operations-engine";
import type { OperationsRow } from "@workspace/universal-operations-engine";

const AI_ACTIONS: OperationsCustomer360WorkspaceData["aiActions"] = [
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
];

function mapTimelineIcon(eventType: string): string {
  const normalized = eventType.toLowerCase();
  if (normalized.includes("appointment") || normalized.includes("booking")) return "Calendar";
  if (normalized.includes("payment")) return "CreditCard";
  if (normalized.includes("invoice")) return "FileText";
  if (normalized.includes("whatsapp")) return "MessageCircle";
  if (normalized.includes("email")) return "Mail";
  if (normalized.includes("task")) return "CheckSquare";
  if (normalized.includes("file")) return "Paperclip";
  if (normalized.includes("lead")) return "UserPlus";
  return "Activity";
}

function mapCommunicationChannel(channel: string): OperationsCustomer360WorkspaceData["communications"][number]["channel"] {
  const normalized = channel.toLowerCase();
  if (normalized.includes("whatsapp")) return "whatsapp";
  if (normalized.includes("email")) return "email";
  if (normalized.includes("sms")) return "sms";
  if (normalized.includes("call") || normalized.includes("phone")) return "call";
  if (normalized.includes("voice")) return "voice_note";
  return "internal";
}

function fileTypeFromMime(mimeType: string): string {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.includes("pdf")) return "pdf";
  return "document";
}

/** Maps application-layer aggregate to existing UI workspace DTO — UI unchanged. */
export function mapCustomer360AggregateToWorkspace(
  aggregate: Customer360AggregateDto,
  row?: OperationsRow | null,
): OperationsCustomer360WorkspaceData {
  const primaryAddress = aggregate.addresses.find((a) => a.isPrimary) ?? aggregate.addresses[0];
  const addressLabel = primaryAddress
    ? [primaryAddress.line1, primaryAddress.city, primaryAddress.country].filter(Boolean).join(", ")
    : null;

  const todaysBooking =
    aggregate.bookings.items.find((b) => b.id === row?.id) ??
    aggregate.bookings.items.find((b) => new Date(b.scheduledAt).toDateString() === new Date().toDateString()) ??
    aggregate.bookings.items[0];

  const scheduledAt = todaysBooking?.scheduledAt ?? row?.values.scheduled_at?.toString() ?? new Date().toISOString();

  return {
    customer: {
      id: aggregate.identity.customerId,
      name: aggregate.identity.displayName,
      email: aggregate.profile.email,
      phone: aggregate.profile.phone,
      company: aggregate.profile.company,
      address: addressLabel,
      birthday: aggregate.profile.birthday,
      tags: aggregate.tags.map((t) => t.label),
      healthScore: aggregate.profile.healthScore,
      avatarColor: aggregate.profile.avatarColor,
    },
    lead: aggregate.lead
      ? {
          id: aggregate.lead.id,
          source: aggregate.lead.source,
          campaign: aggregate.lead.campaign,
          owner: aggregate.lead.owner,
          score: aggregate.lead.score,
          customFields: { ...aggregate.lead.customFields },
          convertedAt: aggregate.lead.convertedAt,
        }
      : null,
    todaysOperation: {
      id: row?.id ?? todaysBooking?.id ?? aggregate.identity.customerId,
      reference: String(row?.values.reference ?? todaysBooking?.id?.slice(0, 8) ?? "OP"),
      service: todaysBooking?.service ?? String(row?.values.service ?? "Service"),
      status: todaysBooking?.status ?? aggregate.summary.currentStatus,
      assignedEmployee: todaysBooking?.resource ?? aggregate.summary.assignedResource ?? "—",
      branch: String(row?.values.branch ?? "Main Branch"),
      room: "—",
      durationMinutes: 30,
      scheduledAt,
      arrivalAt: null,
      checkInAt: null,
      checkOutAt: null,
      countdownMinutes: 0,
      paymentStatus: todaysBooking?.paymentStatus ?? aggregate.summary.currentPaymentStatus,
      paymentAmountCents: aggregate.invoices.items[0]?.amountCents ?? 0,
    },
    summary: {
      photoUrl: null,
      isVip: aggregate.summary.isVip,
      customerSince: aggregate.profile.customerSince,
      lastVisit: aggregate.summary.lastVisit ?? aggregate.profile.customerSince,
      totalVisits: aggregate.summary.totalVisits,
      totalRevenueCents: aggregate.summary.totalRevenueCents,
      lifetimeValueCents: aggregate.summary.lifetimeValueCents,
      preferredEmployee: aggregate.summary.assignedResource ?? "—",
      preferredTime: "—",
      preferredService: todaysBooking?.service ?? "—",
      riskLevel: aggregate.aiContext.riskLevel,
      satisfaction: 4.5,
      aiHealthScore: aggregate.aiContext.healthScore,
    },
    communications: aggregate.activities.recent.map((activity) => ({
      id: activity.id,
      channel: mapCommunicationChannel(activity.channel),
      direction: activity.direction === "inbound" ? "inbound" : "outbound",
      preview: activity.preview ?? activity.subject,
      occurredAt: activity.occurredAt,
      actor: activity.actor ?? "System",
    })),
    timeline: aggregate.timeline.recent.map((item) => ({
      id: item.id,
      type: item.eventType,
      title: item.title,
      summary: item.description,
      occurredAt: item.occurredAt,
      actor: item.actor,
      icon: mapTimelineIcon(item.eventType),
    })),
    bookings: aggregate.bookings.items.map((b) => ({
      id: b.id,
      service: b.service,
      resource: b.resource,
      scheduledAt: b.scheduledAt,
      status: b.status,
      paymentStatus: b.paymentStatus,
    })),
    invoices: aggregate.invoices.items.map((inv) => ({
      id: inv.id,
      number: inv.number,
      amountCents: inv.amountCents,
      status: inv.status,
      issuedAt: inv.issuedAt,
    })),
    payments: aggregate.payments.items.map((pay) => ({
      id: pay.id,
      method: pay.method,
      amountCents: pay.amountCents,
      paidAt: pay.paidAt,
    })),
    activities: aggregate.activities.recent.map((activity) => ({
      id: activity.id,
      channel: activity.channel,
      subject: activity.subject,
      occurredAt: activity.occurredAt,
    })),
    files: aggregate.files.map((file) => ({
      id: file.id,
      name: file.fileName,
      type: fileTypeFromMime(file.mimeType),
      sizeKb: Math.max(1, Math.round(file.sizeBytes / 1024)),
      uploadedAt: file.uploadedAt,
    })),
    notes: aggregate.notes.map((note) => ({
      id: note.id,
      body: note.body,
      author: note.author,
      createdAt: note.createdAt,
      internal: note.isPrivate,
    })),
    notesExtended: aggregate.notes.map((note) => ({
      id: note.id,
      body: note.body,
      author: note.author,
      createdAt: note.createdAt,
      pinned: note.pinned,
      isPrivate: note.isPrivate,
      mentions: [...note.mentions],
      hasAttachments: note.hasAttachments,
    })),
    tasks: aggregate.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      dueAt: task.dueAt ?? new Date().toISOString(),
      status: task.status,
      assignee: task.assignee,
    })),
    aiInsights: aggregate.aiContext.insights.map((insight) => ({
      id: insight.id,
      kind: insight.kind,
      title: insight.title,
      body: insight.body,
      confidence: insight.confidence,
    })),
    aiActions: AI_ACTIONS,
    outstandingBalanceCents: aggregate.summary.outstandingBalanceCents,
    currentStatus: aggregate.summary.currentStatus,
    currentPaymentStatus: aggregate.summary.currentPaymentStatus,
    assignedResource: aggregate.summary.assignedResource,
    priority: aggregate.summary.priority,
  };
}
