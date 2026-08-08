import type { ApplicationContext } from "../contracts/application-context.js";
import type { ApplicationPorts } from "../ports/repository-ports.js";
import type { ReadCachePort } from "../ports/read-cache-port.js";
import type { Lead360AggregateDto } from "../dto/lead360-aggregate-dto.js";
import { createAggregationTelemetryCollector } from "../observability/aggregation-telemetry.js";
import { createNoOpReadCachePort } from "../ports/read-cache-port.js";
import { mapTimelineItem } from "../mappers/projection-mappers.js";

const LEAD_ENTITY_TYPE = "lead";

export type Lead360AggregatorOptions = Readonly<{
  ports: ApplicationPorts;
  cache?: ReadCachePort<Lead360AggregateDto>;
}>;

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

/** Lead360 aggregates the canonical LeadReadModel plus related activity/task/file sections. */
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

    const [timelineResult, activitiesResult, filesResult, tasksResult] = await Promise.allSettled([
      safeLoad(
        "timeline",
        telemetry,
        () =>
          this.ports.timelineRead.listForEntity(context.tenantId, LEAD_ENTITY_TYPE, request.leadId, {
            limit: 50,
          }),
        [],
      ),
      safeLoad(
        "activities",
        telemetry,
        () =>
          this.ports.entityActivityRead.list(context.tenantId, LEAD_ENTITY_TYPE, request.leadId, {
            limit: 50,
          }),
        [],
      ),
      safeLoad(
        "files",
        telemetry,
        () =>
          this.ports.entityFileRead.list(context.tenantId, LEAD_ENTITY_TYPE, request.leadId, {
            limit: 50,
          }),
        [],
      ),
      safeLoad(
        "tasks",
        telemetry,
        () => this.ports.taskRead.listForEntity(context.tenantId, LEAD_ENTITY_TYPE, request.leadId, 50),
        [],
      ),
    ] as const);

    const unwrap = <T>(result: PromiseSettledResult<T>, fallback: T): T =>
      result.status === "fulfilled" ? result.value : fallback;

    const timelineItems = unwrap(timelineResult, []);
    const activities = unwrap(activitiesResult, []);
    const files = unwrap(filesResult, []);
    const tasks = unwrap(tasksResult, []);

    const sortedTimeline = [...timelineItems.map(mapTimelineItem)].sort(
      (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
    );

    const aggregate: Lead360AggregateDto = Object.freeze({
      lead,
      activities: Object.freeze(
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
      tasks: Object.freeze(
        tasks.map((task) =>
          Object.freeze({
            id: task.id,
            title: task.title,
            dueAt: task.dueAt ?? null,
            status: task.status,
            assignee: task.assigneeName ?? task.assigneeId ?? "",
          }),
        ),
      ),
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
      timeline: Object.freeze(sortedTimeline),
      aiStatus: lead.aiStatus,
    });

    await this.cache.set(cacheKey, aggregate);
    return aggregate;
  }
}
