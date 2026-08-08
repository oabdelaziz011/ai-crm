import type { ApplicationContext } from "../contracts/application-context.js";
import type { ApplicationPorts } from "../ports/repository-ports.js";
import type { ReadCachePort } from "../ports/read-cache-port.js";
import type { Customer360AggregateDto } from "../dto/customer360-aggregate-dto.js";
import type { TimelineItemDto } from "../dto/query-dtos.js";
import { createAggregationTelemetryCollector } from "../observability/aggregation-telemetry.js";
import { createNoOpReadCachePort } from "../ports/read-cache-port.js";
import { mapTimelineItem } from "../mappers/projection-mappers.js";

export type Customer360AggregateRequest = Readonly<{
  customerId: string;
  leadId?: string | null;
  templateKey?: string;
  role?: string;
  visibleSections?: readonly string[];
}>;

export type Customer360AggregatorOptions = Readonly<{
  ports: ApplicationPorts;
  cache?: ReadCachePort<Customer360AggregateDto>;
}>;

type Settled<T> = PromiseSettledResult<T>;

function resolveLimit(options?: number | { limit?: number }): number {
  if (typeof options === "number") return options;
  return options?.limit ?? 50;
}

async function safeLoad<T>(
  source: string,
  telemetry: ReturnType<typeof createAggregationTelemetryCollector>,
  loader: () => Promise<T>,
  fallback: T,
): Promise<T> {
  telemetry.markRepositoryCall();
  try {
    return await loader();
  } catch (error) {
    telemetry.markFailure();
    telemetry.addWarning(source, error instanceof Error ? error.message : String(error), "LOAD_FAILED");
    return fallback;
  }
}

function avatarColorFromId(id: string): string {
  const palette = ["#6366f1", "#8b5cf6", "#ec4899", "#14b8a6", "#f59e0b"];
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash + id.charCodeAt(i) * 17) % palette.length;
  return palette[hash] ?? palette[0];
}

function mapActivityChannel(eventType: string): string {
  const normalized = eventType.toLowerCase();
  if (normalized.includes("whatsapp")) return "WhatsApp";
  if (normalized.includes("email")) return "Email";
  if (normalized.includes("sms")) return "SMS";
  if (normalized.includes("call") || normalized.includes("phone")) return "Phone";
  if (normalized.includes("meeting")) return "Meeting";
  if (normalized.includes("note")) return "Internal Notes";
  return eventType;
}

function computeRiskLevel(outstandingCents: number, healthScore: number): "low" | "medium" | "high" {
  if (outstandingCents > 50_000 || healthScore < 40) return "high";
  if (outstandingCents > 10_000 || healthScore < 65) return "medium";
  return "low";
}

/** Aggregates Customer360 data from repository ports — parallel fetch, graceful partial failures. */
export class Customer360Aggregator {
  private readonly ports: ApplicationPorts;
  private readonly cache: ReadCachePort<Customer360AggregateDto>;

  constructor(options: Customer360AggregatorOptions) {
    this.ports = options.ports;
    this.cache = (options.cache ?? createNoOpReadCachePort()) as ReadCachePort<Customer360AggregateDto>;
  }

  async aggregate(
    request: Customer360AggregateRequest,
    context: ApplicationContext,
  ): Promise<Customer360AggregateDto | null> {
    const telemetry = createAggregationTelemetryCollector();
    const cacheKey = this.cache.buildKey({
      namespace: "customer360",
      tenantId: context.tenantId,
      entityType: "customer",
      entityId: request.customerId,
      variant: request.templateKey ?? "default",
    });

    const cached = await this.cache.get(cacheKey);
    if (cached) {
      telemetry.markCacheHit();
      return cached;
    }

    telemetry.markRepositoryCall();
    const customer = await this.ports.customerRead.getById(context.tenantId, request.customerId);
    if (!customer) return null;

    const timelineOptions = { limit: 50 };
    const [
      timelineResult,
      tagsResult,
      addressesResult,
      contactsResult,
      customFieldsResult,
      activitiesResult,
      filesResult,
      tasksResult,
      bookingsResult,
      invoicesResult,
      paymentsResult,
      leadResult,
    ] = await Promise.allSettled([
      safeLoad("timeline", telemetry, () =>
        this.ports.timelineRead.listForEntity(context.tenantId, "customer", request.customerId, timelineOptions),
      []),
      safeLoad("tags", telemetry, () =>
        this.ports.customerTagRead.listForCustomer(context.tenantId, request.customerId),
      []),
      safeLoad("addresses", telemetry, () =>
        this.ports.customerAddressRead.listForCustomer(context.tenantId, request.customerId),
      []),
      safeLoad("contacts", telemetry, () =>
        this.ports.customerContactRead.listForCustomer(context.tenantId, request.customerId),
      []),
      safeLoad("customFields", telemetry, () =>
        this.ports.customerCustomFieldRead.listForCustomer(context.tenantId, request.customerId),
      []),
      safeLoad("activities", telemetry, () =>
        this.ports.activityRead.listForCustomer(context.tenantId, request.customerId, 25),
      []),
      safeLoad("files", telemetry, () =>
        this.ports.fileRead.listForEntity(context.tenantId, "customer", request.customerId, 25),
      []),
      safeLoad("tasks", telemetry, () =>
        this.ports.taskRead.listForEntity(context.tenantId, "customer", request.customerId, 25),
      []),
      safeLoad("bookings", telemetry, () =>
        this.ports.bookingRead.listForCustomer(context.tenantId, request.customerId),
      []),
      safeLoad("invoices", telemetry, () =>
        this.ports.invoiceRead.listForCustomer(context.tenantId, request.customerId),
      []),
      safeLoad("payments", telemetry, () =>
        this.ports.paymentRead.listForCustomer(context.tenantId, request.customerId),
      []),
      safeLoad("lead", telemetry, async () => {
        if (request.leadId) {
          return this.ports.leadRead.getById(context.tenantId, request.leadId);
        }
        return this.ports.leadRead.findByCustomer(context.tenantId, request.customerId);
      }, null),
    ] as const);

    const unwrap = <T>(result: Settled<T>, source: string, fallback: T): T => {
      if (result.status === "rejected") {
        telemetry.markFailure();
        telemetry.addWarning(source, result.reason instanceof Error ? result.reason.message : String(result.reason));
        return fallback;
      }
      return result.value;
    };

    const timelineItems = unwrap(timelineResult, "timeline", []);
    const tags = unwrap(tagsResult, "tags", []);
    const addresses = unwrap(addressesResult, "addresses", []);
    const contacts = unwrap(contactsResult, "contacts", []);
    const customFields = unwrap(customFieldsResult, "customFields", []);
    const activities = unwrap(activitiesResult, "activities", []);
    const files = unwrap(filesResult, "files", []);
    const tasks = unwrap(tasksResult, "tasks", []);
    const bookings = unwrap(bookingsResult, "bookings", []);
    const invoices = unwrap(invoicesResult, "invoices", []);
    const payments = unwrap(paymentsResult, "payments", []);
    const lead = unwrap(leadResult, "lead", null);

    const timelineDtos: TimelineItemDto[] = timelineItems.map(mapTimelineItem);
    const sortedTimeline = [...timelineDtos].sort(
      (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
    );

    const outstandingFromInvoices = invoices.reduce((sum, inv) => {
      const normalized = inv.status.toLowerCase();
      if (["paid", "completed", "settled", "cancelled"].includes(normalized)) return sum;
      return sum + inv.amountCents;
    }, 0);

    const totalRevenueCents = payments.reduce((sum, p) => sum + p.amountCents, 0);
    const healthScore = Math.min(100, Math.max(0, 70 + (customer.isVip ? 10 : 0) - Math.floor(outstandingFromInvoices / 5000)));
    const completedBookings = bookings.filter((b) => ["completed", "checked out", "done"].includes(b.status.toLowerCase()));

    const aggregate: Customer360AggregateDto = Object.freeze({
      identity: Object.freeze({
        customerId: customer.id,
        tenantId: customer.tenantId,
        displayName: customer.displayName,
      }),
      profile: Object.freeze({
        email: customer.email ?? null,
        phone: customer.phone ?? null,
        company: null,
        birthday: null,
        avatarColor: avatarColorFromId(customer.id),
        healthScore,
        customerSince: customer.createdAt,
        notes: customer.notes ?? null,
      }),
      contacts: Object.freeze(contacts.map((c) => Object.freeze({ ...c }))),
      addresses: Object.freeze(addresses.map((a) => Object.freeze({ ...a }))),
      tags: Object.freeze(tags.map((t) => Object.freeze({ ...t }))),
      customFields: Object.freeze(customFields.map((f) => Object.freeze({ ...f }))),
      lead: lead
        ? Object.freeze({
            id: lead.id,
            source: lead.source,
            campaign: null,
            owner: lead.owner,
            score: lead.score,
            customFields: Object.freeze({}),
            convertedAt: null,
          })
        : null,
      summary: Object.freeze({
        isVip: customer.isVip,
        outstandingBalanceCents: customer.outstandingBalanceCents || outstandingFromInvoices,
        currentStatus: customer.currentStatus,
        currentPaymentStatus: bookings[0]?.paymentStatus ?? "Unknown",
        assignedResource: bookings[0]?.employeeName ?? null,
        priority: "normal",
        totalVisits: completedBookings.length,
        totalRevenueCents,
        lifetimeValueCents: totalRevenueCents,
        lastVisit: completedBookings[0]?.scheduledAt ?? null,
      }),
      timeline: Object.freeze({
        total: sortedTimeline.length,
        recent: Object.freeze(sortedTimeline),
      }),
      activities: Object.freeze({
        total: activities.length,
        channels: Object.freeze([...new Set(activities.map((a) => a.channel))]),
        recent: Object.freeze(activities.map((a) => Object.freeze({ ...a }))),
      }),
      notes: Object.freeze(
        customer.notes
          ? [
              Object.freeze({
                id: `note_${customer.id}`,
                body: customer.notes,
                author: "System",
                createdAt: customer.createdAt,
                pinned: false,
                isPrivate: true,
                mentions: Object.freeze([] as string[]),
                hasAttachments: false,
              }),
            ]
          : [],
      ),
      files: Object.freeze(
        files.map((f) =>
          Object.freeze({
            id: f.id,
            fileName: f.fileName,
            mimeType: f.mimeType,
            sizeBytes: f.sizeBytes,
            uploadedAt: f.uploadedAt,
            previewUrl: f.previewUrl ?? null,
          }),
        ),
      ),
      tasks: Object.freeze(
        tasks.map((t) =>
          Object.freeze({
            id: t.id,
            title: t.title,
            dueAt: t.dueAt ?? null,
            status: t.status,
            assignee: t.assigneeName ?? t.assigneeId,
          }),
        ),
      ),
      bookings: Object.freeze({
        total: bookings.length,
        upcoming: bookings.filter((b) => new Date(b.scheduledAt) >= new Date()).length,
        items: Object.freeze(
          bookings.map((b) =>
            Object.freeze({
              id: b.id,
              service: b.serviceName ?? b.reference,
              resource: b.employeeName ?? "—",
              scheduledAt: b.scheduledAt,
              status: b.status,
              paymentStatus: b.paymentStatus,
            }),
          ),
        ),
      }),
      invoices: Object.freeze({
        total: invoices.length,
        outstandingCents: outstandingFromInvoices,
        items: Object.freeze(
          invoices.map((inv) =>
            Object.freeze({
              id: inv.id,
              number: inv.number ?? inv.id.slice(0, 8),
              amountCents: inv.amountCents,
              status: inv.status,
              issuedAt: inv.generatedAt,
            }),
          ),
        ),
      }),
      payments: Object.freeze({
        total: payments.length,
        totalCents: totalRevenueCents,
        items: Object.freeze(
          payments.map((p) =>
            Object.freeze({
              id: p.id,
              method: p.method,
              amountCents: p.amountCents,
              paidAt: p.collectedAt,
            }),
          ),
        ),
      }),
      aiContext: Object.freeze({
        healthScore,
        riskLevel: computeRiskLevel(outstandingFromInvoices, healthScore),
        insights: Object.freeze([]),
      }),
      workspace: Object.freeze({
        templateKey: request.templateKey ?? "clinic",
        generatedAt: new Date().toISOString(),
        correlationId: context.correlationId,
      }),
      role: Object.freeze({
        role: request.role ?? "manager",
        visibleSections: Object.freeze(request.visibleSections ?? []),
      }),
      warnings: Object.freeze([] as string[]),
      telemetry: Object.freeze({
        durationMs: 0,
        repositoryCalls: 0,
        cacheHits: 0,
        failures: 0,
      }),
    });

    const finishedTelemetry = telemetry.finish();
    const finalAggregate: Customer360AggregateDto = Object.freeze({
      ...aggregate,
      warnings: Object.freeze(finishedTelemetry.warnings.map((w) => `${w.source}: ${w.message}`)),
      telemetry: Object.freeze({
        durationMs: finishedTelemetry.durationMs,
        repositoryCalls: finishedTelemetry.repositoryCalls,
        cacheHits: finishedTelemetry.cacheHits,
        failures: finishedTelemetry.failures,
      }),
    });

    await this.cache.set(cacheKey, finalAggregate);
    return finalAggregate;
  }
}

export { mapActivityChannel };
