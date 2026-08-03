import type { ApplicationContext } from "../contracts/application-context.js";
import type { ApplicationPorts } from "../ports/repository-ports.js";
import type { ReadCachePort } from "../ports/read-cache-port.js";
import type { Lead360AggregateDto } from "../dto/lead360-aggregate-dto.js";
import type { TimelineItemDto } from "../dto/query-dtos.js";
import { createAggregationTelemetryCollector } from "../observability/aggregation-telemetry.js";
import { createNoOpReadCachePort } from "../ports/read-cache-port.js";
import { mapTimelineItem } from "../mappers/projection-mappers.js";

const LEAD_ENTITY_TYPE = "lead";

export type Lead360AggregatorOptions = Readonly<{
  ports: ApplicationPorts;
  cache?: ReadCachePort<Lead360AggregateDto>;
}>;

function resolveScoreBand(score: number): "cold" | "warm" | "hot" {
  if (score >= 70) return "hot";
  if (score >= 40) return "warm";
  return "cold";
}

function computeRiskLevel(score: number, lifecycleStatus: string): "low" | "medium" | "high" {
  if (lifecycleStatus === "lost" || lifecycleStatus === "archived") return "high";
  if (score < 30) return "high";
  if (score < 55) return "medium";
  return "low";
}

function buildIntelligence(
  lead: NonNullable<Awaited<ReturnType<ApplicationPorts["leadRead"]["getById"]>>>,
  stageName: string | null,
): Lead360AggregateDto["intelligence"] {
  const band = resolveScoreBand(lead.score);
  return Object.freeze({
    summary: lead.title ? `Lead ${lead.title} — ${band} priority` : null,
    nextBestAction:
      band === "hot"
        ? "Schedule a follow-up call within 24 hours"
        : band === "warm"
          ? "Send a personalized email with value proposition"
          : "Enrich lead profile and assign owner",
    suggestedFollowUp:
      lifecycleFollowUp(lead.lifecycleStatus) ?? "Review recent activity and update stage",
    healthLabel: band === "hot" ? "Strong engagement" : band === "warm" ? "Moderate engagement" : "Needs nurturing",
    scoreExplanation: `Score ${lead.score}/100 based on engagement, source, and pipeline stage`,
    recommendedStage: stageName,
  });
}

function lifecycleFollowUp(status: string): string | null {
  const map: Record<string, string> = {
    new: "Make first contact within 48 hours",
    contacted: "Book discovery meeting",
    qualified: "Send proposal",
    proposal_sent: "Follow up on proposal feedback",
    negotiation: "Confirm decision timeline",
  };
  return map[status] ?? null;
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

/** Aggregates Lead360 from universal entity ports + lead read port — parallel, partial-failure safe. */
export class Lead360Aggregator {
  private readonly ports: ApplicationPorts;
  private readonly cache: ReadCachePort<Lead360AggregateDto>;

  constructor(options: Lead360AggregatorOptions) {
    this.ports = options.ports;
    this.cache = (options.cache ?? createNoOpReadCachePort()) as ReadCachePort<Lead360AggregateDto>;
  }

  async aggregate(
    request: { leadId: string; pipelineId?: string },
    context: ApplicationContext,
  ): Promise<Lead360AggregateDto | null> {
    const telemetry = createAggregationTelemetryCollector();
    const cacheKey = this.cache.buildKey({
      namespace: "lead360",
      tenantId: context.tenantId,
      entityType: LEAD_ENTITY_TYPE,
      entityId: request.leadId,
      variant: request.pipelineId ?? "default",
    });

    const cached = await this.cache.get(cacheKey);
    if (cached) {
      telemetry.markCacheHit();
      return cached;
    }

    const lead = await this.ports.leadRead.getById(context.tenantId, request.leadId);
    if (!lead) return null;

    const [
      timelineResult,
      contactsResult,
      tagsResult,
      customFieldsResult,
      activitiesResult,
      filesResult,
      tasksResult,
      relatedResult,
      stagesResult,
      pipelinesResult,
    ] = await Promise.allSettled([
      safeLoad("timeline", telemetry, () =>
        this.ports.timelineRead.listForEntity(context.tenantId, LEAD_ENTITY_TYPE, request.leadId, { limit: 50 }),
      []),
      safeLoad("contacts", telemetry, () =>
        this.ports.entityContactRead.list(context.tenantId, LEAD_ENTITY_TYPE, request.leadId),
      []),
      safeLoad("tags", telemetry, () =>
        this.ports.entityTagRead.listForEntity(context.tenantId, LEAD_ENTITY_TYPE, request.leadId),
      []),
      safeLoad("customFields", telemetry, () =>
        this.ports.entityCustomFieldRead.listValues(context.tenantId, LEAD_ENTITY_TYPE, request.leadId),
      []),
      safeLoad("activities", telemetry, () =>
        this.ports.entityActivityRead.list(context.tenantId, LEAD_ENTITY_TYPE, request.leadId, { limit: 25 }),
      []),
      safeLoad("files", telemetry, () =>
        this.ports.entityFileRead.list(context.tenantId, LEAD_ENTITY_TYPE, request.leadId, { limit: 25 }),
      []),
      safeLoad("tasks", telemetry, () =>
        this.ports.taskRead.listForEntity(context.tenantId, LEAD_ENTITY_TYPE, request.leadId, 25),
      []),
      safeLoad("related", telemetry, async () => {
        const relPort = (this.ports as ApplicationPorts & { entityRelationshipRead?: { listForEntity: Function } })
          .entityRelationshipRead;
        if (!relPort) return [];
        return relPort.listForEntity(context.tenantId, LEAD_ENTITY_TYPE, request.leadId);
      }, []),
      safeLoad("stages", telemetry, () =>
        this.ports.leadRead.listStages(context.tenantId, lead.pipelineId),
      []),
      safeLoad("pipelines", telemetry, () => this.ports.leadRead.listPipelines(context.tenantId), []),
    ] as const);

    const unwrap = <T>(result: PromiseSettledResult<T>, fallback: T): T =>
      result.status === "fulfilled" ? result.value : fallback;

    const timelineItems = unwrap(timelineResult, []);
    const contacts = unwrap(contactsResult, []);
    const tagAssignments = unwrap(tagsResult, []);
    const customFields = unwrap(customFieldsResult, []);
    const activities = unwrap(activitiesResult, []);
    const files = unwrap(filesResult, []);
    const tasks = unwrap(tasksResult, []);
    const relatedEntities = unwrap(relatedResult, []);
    const stages = unwrap(stagesResult, []);
    const pipelines = unwrap(pipelinesResult, []);

    const stage = stages.find((s) => s.id === lead.stageId) ?? null;
    const pipeline = pipelines.find((p) => p.id === lead.pipelineId) ?? null;
    const timelineDtos: TimelineItemDto[] = timelineItems.map(mapTimelineItem);
    const sortedTimeline = [...timelineDtos].sort(
      (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
    );

    const aggregate: Lead360AggregateDto = Object.freeze({
      identity: Object.freeze({
        leadId: lead.id,
        tenantId: lead.tenantId,
        title: lead.title,
        contactName: lead.contactName,
      }),
      profile: Object.freeze({
        email: lead.email,
        phone: lead.phone,
        companyName: lead.companyName,
        lifecycleStatus: lead.lifecycleStatus,
        stageId: lead.stageId,
        stageName: stage?.name ?? null,
        pipelineId: lead.pipelineId,
        pipelineName: pipeline?.name ?? null,
        priority: lead.priority,
        score: lead.score,
        scoreBand: resolveScoreBand(lead.score),
        estimatedValue: lead.estimatedValue,
        currency: lead.currency,
        isQualified: lead.isQualified,
        assignedUserId: lead.assignedUserId,
        ownerName: lead.owner ?? lead.assignedUserId,
        sourceName: lead.source ?? null,
        customerId: lead.customerId,
        conversationId: lead.conversationId,
        createdAt: lead.createdAt,
        updatedAt: lead.updatedAt,
        aiSummary: null,
      }),
      contacts: Object.freeze(
        contacts.map((c) =>
          Object.freeze({
            id: c.id,
            name: c.displayName,
            email: c.emails.find((e) => e.isPrimary)?.value ?? c.emails[0]?.value ?? null,
            phone: c.phones.find((p) => p.isPrimary)?.value ?? c.phones[0]?.value ?? c.whatsapp,
            role: c.contactType,
            isPrimary: c.isPrimary,
          }),
        ),
      ),
      tags: Object.freeze(
        tagAssignments.map((item) =>
          Object.freeze({
            id: item.tag.id,
            label: item.tag.name,
            color: item.tag.color,
          }),
        ),
      ),
      customFields: Object.freeze(
        customFields.map((field) =>
          Object.freeze({
            key: field.fieldKey,
            label: field.label,
            value: field.value,
            fieldType: field.fieldType,
          }),
        ),
      ),
      timeline: Object.freeze({
        total: sortedTimeline.length,
        recent: Object.freeze(sortedTimeline),
      }),
      activities: Object.freeze({
        total: activities.length,
        channels: Object.freeze([...new Set(activities.map((a) => a.channel))]),
        recent: Object.freeze(
          activities.map((a) =>
            Object.freeze({
              id: a.id,
              channel: a.channel,
              subject: a.subject,
              occurredAt: a.occurredAt,
              preview: a.preview,
              actor: a.actorName,
              outcome: a.outcome,
            }),
          ),
        ),
      }),
      files: Object.freeze(
        files.map((f) =>
          Object.freeze({
            id: f.id,
            fileName: f.fileName,
            mimeType: f.mimeType,
            sizeBytes: f.sizeBytes,
            uploadedAt: f.uploadedAt,
            previewUrl: f.previewUrl,
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
      relatedEntities: Object.freeze(
        relatedEntities.map((rel: { id: string; targetEntityType: string; targetEntityId: string; label: string; relationType: string }) =>
          Object.freeze({
            id: rel.id,
            entityType: rel.targetEntityType,
            entityId: rel.targetEntityId,
            label: rel.label,
            relationType: rel.relationType,
          }),
        ),
      ),
      intelligence: buildIntelligence(lead, stage?.name ?? null),
      riskLevel: computeRiskLevel(lead.score, lead.lifecycleStatus),
    });

    await this.cache.set(cacheKey, aggregate);
    return aggregate;
  }
}
