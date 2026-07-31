import type { AiEmployeeRepository } from "@/lib/ai-employees/repositories";
import type { AiEmployeeSkillRepository } from "@/lib/ai-employees/repositories/ai-employee-skill-repository";
import { buildToolMetadataCatalog } from "@/lib/ai-employees/adapters/tool-metadata-adapter";
import {
  aggregateSkillAnalytics,
  buildSkillAnalytics,
  buildSkillDocumentationView,
  buildSkillReadiness,
  buildSkillValidation,
  deriveRecentlyUsedSkillIds,
  detectCircularDependencies,
  mapSkillRow,
  mapSkillRows,
  resolveEffectiveToolKeys,
  selectUniqueSkillCategories,
  skillToVersionSnapshot,
  summarizeSkills,
} from "@/lib/ai-employees/selectors/skill-selectors";
import type {
  AiEmployeeRecord,
  AiSkillFormValues,
  AiSkillListFilter,
  AiSkillPlatformSnapshot,
  PublishAiSkillInput,
  RollbackAiSkillInput,
} from "@/lib/ai-employees/types";
import { AiEmployeeSkillError } from "./ai-employee-skill-errors";

export class AiEmployeeSkillService {
  constructor(
    private readonly skills: AiEmployeeSkillRepository,
    private readonly employees: AiEmployeeRepository,
  ) {}

  async list(companyId: string, filter: AiSkillListFilter = {}) {
    const rows = await this.skills.listByCompany(companyId, filter);
    return mapSkillRows(rows);
  }

  async getById(skillId: string, companyId: string) {
    const row = await this.skills.getById(skillId, companyId);
    return row ? mapSkillRow(row) : null;
  }

  async create(companyId: string, values: AiSkillFormValues, actorId?: string | null) {
    const existing = await this.skills.getByKey(companyId, values.key);
    if (existing) {
      throw new AiEmployeeSkillError("Skill key already exists", "duplicate_key");
    }

    const row = await this.skills.create({
      company_id: companyId,
      key: values.key.trim(),
      name: values.name.trim(),
      display_name: values.displayName.trim(),
      description: values.description.trim(),
      category: values.category.trim() || "general",
      tags: values.tags,
      tool_keys: values.toolKeys,
      required_permissions: values.requiredPermissions,
      required_knowledge_ids: values.requiredKnowledgeIds,
      runtime_recommendations: values.runtimeRecommendations,
      documentation: values.documentation,
      status: "draft",
      has_unpublished_draft: true,
      created_by: actorId ?? null,
      updated_by: actorId ?? null,
    });

    await this.skills.recordChangeEvent({
      companyId,
      skillId: row.id,
      eventType: "created",
      actorId,
    });

    return mapSkillRow(row);
  }

  async update(skillId: string, companyId: string, values: Partial<AiSkillFormValues>, actorId?: string | null) {
    const existing = await this.skills.getById(skillId, companyId);
    if (!existing) {
      throw new AiEmployeeSkillError("Skill not found", "not_found");
    }
    if (existing.status === "archived") {
      throw new AiEmployeeSkillError("Archived skills cannot be edited", "invalid_state");
    }

    const row = await this.skills.update(skillId, companyId, {
      ...(values.name != null ? { name: values.name.trim() } : {}),
      ...(values.displayName != null ? { display_name: values.displayName.trim() } : {}),
      ...(values.description != null ? { description: values.description.trim() } : {}),
      ...(values.category != null ? { category: values.category.trim() || "general" } : {}),
      ...(values.tags != null ? { tags: values.tags } : {}),
      ...(values.toolKeys != null ? { tool_keys: values.toolKeys } : {}),
      ...(values.requiredPermissions != null ? { required_permissions: values.requiredPermissions } : {}),
      ...(values.requiredKnowledgeIds != null ? { required_knowledge_ids: values.requiredKnowledgeIds } : {}),
      ...(values.runtimeRecommendations != null ? { runtime_recommendations: values.runtimeRecommendations } : {}),
      ...(values.documentation != null ? { documentation: values.documentation } : {}),
      has_unpublished_draft: true,
      updated_by: actorId ?? null,
    });

    await this.skills.recordChangeEvent({
      companyId,
      skillId,
      eventType: "updated",
      actorId,
    });

    return mapSkillRow(row);
  }

  async archive(skillId: string, companyId: string, actorId?: string | null) {
    const row = await this.skills.archive(skillId, companyId, actorId);
    await this.skills.recordChangeEvent({ companyId, skillId, eventType: "archived", actorId });
    return mapSkillRow(row);
  }

  async restore(skillId: string, companyId: string, actorId?: string | null) {
    const row = await this.skills.restore(skillId, companyId, actorId);
    await this.skills.recordChangeEvent({ companyId, skillId, eventType: "restored", actorId });
    return mapSkillRow(row);
  }

  async assignToEmployee(input: {
    employeeId: string;
    companyId: string;
    skillIds: string[];
    actorId?: string | null;
  }) {
    const employee = await this.employees.getById(input.employeeId, input.companyId);
    if (!employee) {
      throw new AiEmployeeSkillError("AI Employee not found", "not_found");
    }

    const skillRows = await this.skills.getByIds(input.skillIds, input.companyId);
    const skillRecords = mapSkillRows(skillRows);
    const summary = summarizeSkills(skillRecords);

    await this.skills.updateEmployeeSkills(
      input.employeeId,
      input.companyId,
      input.skillIds,
      summary,
      input.actorId,
    );

    for (const skillId of input.skillIds) {
      await this.skills.recordChangeEvent({
        companyId: input.companyId,
        skillId,
        eventType: "assigned",
        metadata: { employeeId: input.employeeId },
        actorId: input.actorId,
      });
    }
  }

  async resolveToolKeysForEmployee(companyId: string, employee: AiEmployeeRecord): Promise<string[]> {
    const skillIds = employee.allowedSkillIds ?? [];
    if (skillIds.length === 0) return employee.allowedToolKeys;

    const [skillRows, allDependencyEdges] = await Promise.all([
      this.skills.getByIds(skillIds, companyId),
      this.skills.listAllDependencies(companyId),
    ]);

    const skills = mapSkillRows(skillRows);
    const allSkillsById = new Map(skills.map((skill) => [skill.id, skill]));

    const dependencyEdges = allDependencyEdges.map((edge) => ({
      skillId: edge.skill_id,
      dependsOnSkillId: edge.depends_on_skill_id,
    }));

    return resolveEffectiveToolKeys(employee.allowedToolKeys, skills, allSkillsById, dependencyEdges);
  }

  async loadPlatformSnapshot(input: {
    companyId: string;
    employee: AiEmployeeRecord;
    userId?: string | null;
    marketplaceFilter?: AiSkillListFilter;
  }): Promise<AiSkillPlatformSnapshot> {
    const assignedIds = input.employee.allowedSkillIds ?? [];
    const [allSkillRows, assignedRows, dbTools, knowledgeSources, allDependencyEdges, changeEvents] =
      await Promise.all([
        this.skills.listByCompany(input.companyId, input.marketplaceFilter ?? {}),
        assignedIds.length > 0 ? this.skills.getByIds(assignedIds, input.companyId) : Promise.resolve([]),
        this.employees.listEnabledTools(),
        this.employees.listKnowledgeSources(input.companyId),
        this.skills.listAllDependencies(input.companyId),
        assignedIds.length > 0
          ? Promise.all(assignedIds.map((id) => this.skills.listChangeEvents(id, input.companyId, 10))).then((lists) =>
              lists.flat(),
            )
          : Promise.resolve([]),
      ]);

    const toolCatalog = buildToolMetadataCatalog(dbTools);
    const knownToolKeys = new Set(toolCatalog.map((tool) => tool.key));
    const knownKnowledgeIds = new Set(knowledgeSources.map((source) => source.id));
    const allSkills = mapSkillRows(allSkillRows);
    const assignedSkills = mapSkillRows(assignedRows);
    const allSkillsById = new Map(allSkills.map((skill) => [skill.id, skill]));

    const dependencyEdges = allDependencyEdges.map((edge) => ({
      skillId: edge.skill_id,
      dependsOnSkillId: edge.depends_on_skill_id,
    }));

    const favoriteIds =
      input.userId != null
        ? new Set(await this.skills.listFavorites(input.companyId, input.userId))
        : new Set<string>();

    const effectiveToolKeys = resolveEffectiveToolKeys(
      input.employee.allowedToolKeys,
      assignedSkills,
      allSkillsById,
      dependencyEdges,
    );

    const toolExecutions = await this.skills.listToolExecutions(input.companyId, effectiveToolKeys);

    const marketplace = await Promise.all(
      allSkills.map(async (skill) => {
        const depRows = allDependencyEdges.filter((edge) => edge.skill_id === skill.id);
        const dependencies = depRows.map((edge) => ({
          id: edge.id,
          skillId: edge.skill_id,
          dependsOnSkillId: edge.depends_on_skill_id,
          dependsOnDisplayName: allSkillsById.get(edge.depends_on_skill_id)?.displayName,
        }));

        const validation = buildSkillValidation({
          skill,
          knownToolKeys,
          knownKnowledgeIds,
          dependencyEdges,
        });

        const assignmentCount = await this.skills.countAssignments(skill.id, input.companyId);
        const analytics = buildSkillAnalytics({
          assignmentCount,
          toolExecutions,
          skillToolKeys: skill.toolKeys,
        });

        return {
          ...skill,
          isFavorite: favoriteIds.has(skill.id),
          analytics,
          dependencyCount: depRows.length,
          readiness: buildSkillReadiness({ skill, validation, dependencyCount: depRows.length, toolCatalog }),
        };
      }),
    );

    const primarySkill = assignedSkills[0] ?? null;
    const primaryDependencies = primarySkill
      ? allDependencyEdges
          .filter((edge) => edge.skill_id === primarySkill.id)
          .map((edge) => ({
            id: edge.id,
            skillId: edge.skill_id,
            dependsOnSkillId: edge.depends_on_skill_id,
            dependsOnDisplayName: allSkillsById.get(edge.depends_on_skill_id)?.displayName,
          }))
      : [];

    const validation = primarySkill
      ? buildSkillValidation({
          skill: primarySkill,
          knownToolKeys,
          knownKnowledgeIds,
          dependencyEdges,
        })
      : { ready: assignedSkills.length > 0, issues: [] };

    const readiness = primarySkill
      ? buildSkillReadiness({
          skill: primarySkill,
          validation,
          dependencyCount: primaryDependencies.length,
          toolCatalog,
        })
      : {
          score: assignedSkills.length > 0 ? 50 : 0,
          ready: false,
          categories: [],
        };

    const versions = primarySkill
      ? await this.skills.listVersions(primarySkill.id, input.companyId)
      : [];

    const cycles = primarySkill ? detectCircularDependencies(primarySkill.id, dependencyEdges) : [];

    return {
      assignedSkills,
      marketplace,
      categories: selectUniqueSkillCategories(allSkills),
      recentlyUsedSkillIds: deriveRecentlyUsedSkillIds(changeEvents),
      effectiveToolKeys,
      readiness,
      validation,
      documentation: primarySkill ? buildSkillDocumentationView(primarySkill, primaryDependencies) : null,
      analytics: aggregateSkillAnalytics(marketplace.map((entry) => entry.analytics)),
      dependencies: primaryDependencies,
      circularDependencyPaths: cycles,
      versions,
    };
  }

  async testConfiguration(skillId: string, companyId: string, actorId?: string | null) {
    const skill = await this.getById(skillId, companyId);
    if (!skill) {
      throw new AiEmployeeSkillError("Skill not found", "not_found");
    }

    const [dbTools, knowledgeSources, dependencyEdges] = await Promise.all([
      this.employees.listEnabledTools(),
      this.employees.listKnowledgeSources(companyId),
      this.skills.listDependencies(skillId, companyId),
    ]);

    const toolCatalog = buildToolMetadataCatalog(dbTools);
    const allEdges = (await this.skills.listAllDependencies(companyId)).map((edge) => ({
      skillId: edge.skill_id,
      dependsOnSkillId: edge.depends_on_skill_id,
    }));

    const validation = buildSkillValidation({
      skill,
      knownToolKeys: new Set(toolCatalog.map((tool) => tool.key)),
      knownKnowledgeIds: new Set(knowledgeSources.map((source) => source.id)),
      dependencyEdges: allEdges,
    });

    const readiness = buildSkillReadiness({
      skill,
      validation,
      dependencyCount: dependencyEdges.length,
      toolCatalog,
    });

    await this.skills.recordChangeEvent({
      companyId,
      skillId,
      eventType: "tested",
      metadata: { ready: validation.ready, score: readiness.score },
      actorId,
    });

    return { validation, readiness };
  }

  async publish(input: PublishAiSkillInput) {
    const skill = await this.getById(input.skillId, input.companyId);
    if (!skill) {
      throw new AiEmployeeSkillError("Skill not found", "not_found");
    }
    if (skill.status === "archived") {
      throw new AiEmployeeSkillError("Archived skills cannot be published", "invalid_state");
    }

    const testResult = await this.testConfiguration(input.skillId, input.companyId, input.actorId);
    if (!testResult.validation.ready || !testResult.readiness.ready) {
      throw new AiEmployeeSkillError("Skill is not ready to publish", "validation", testResult);
    }

    const versionNumber = await this.skills.getNextVersionNumber(input.skillId, input.companyId);
    const snapshot = skillToVersionSnapshot(skill);
    const version = await this.skills.createVersion({
      companyId: input.companyId,
      skillId: input.skillId,
      versionNumber,
      snapshot,
      publishNotes: input.publishNotes?.trim() ?? "",
      actorId: input.actorId,
    });

    await this.skills.markVersionsSuperseded(input.skillId, input.companyId, version.id);
    await this.skills.createDeployment({
      companyId: input.companyId,
      skillId: input.skillId,
      versionId: version.id,
      versionNumber,
      publishNotes: input.publishNotes?.trim() ?? "",
      actorId: input.actorId,
    });

    await this.skills.update(input.skillId, input.companyId, {
      status: "published",
      published_version_id: version.id,
      current_version_number: versionNumber,
      has_unpublished_draft: false,
      updated_by: input.actorId ?? null,
    });

    await this.skills.recordChangeEvent({
      companyId: input.companyId,
      skillId: input.skillId,
      eventType: "published",
      metadata: { versionNumber },
      actorId: input.actorId,
    });

    return { version, ...testResult };
  }

  async rollback(input: RollbackAiSkillInput) {
    const skill = await this.getById(input.skillId, input.companyId);
    if (!skill) {
      throw new AiEmployeeSkillError("Skill not found", "not_found");
    }

    const version = await this.skills.getVersionByNumber(input.skillId, input.companyId, input.versionNumber);
    if (!version) {
      throw new AiEmployeeSkillError("Version not found", "not_found");
    }

    await this.skills.update(input.skillId, input.companyId, {
      display_name: version.snapshot.displayName,
      description: version.snapshot.description,
      category: version.snapshot.category,
      tags: version.snapshot.tags,
      tool_keys: version.snapshot.toolKeys,
      required_permissions: version.snapshot.requiredPermissions,
      required_knowledge_ids: version.snapshot.requiredKnowledgeIds,
      runtime_recommendations: version.snapshot.runtimeRecommendations,
      documentation: version.snapshot.documentation,
      published_version_id: version.id,
      current_version_number: version.versionNumber,
      has_unpublished_draft: false,
      status: "published",
      updated_by: input.actorId ?? null,
    });

    await this.skills.createDeployment({
      companyId: input.companyId,
      skillId: input.skillId,
      versionId: version.id,
      versionNumber: version.versionNumber,
      publishNotes: `Rollback to v${version.versionNumber}`,
      actorId: input.actorId,
    });

    await this.skills.recordChangeEvent({
      companyId: input.companyId,
      skillId: input.skillId,
      eventType: "rolled_back",
      metadata: { versionNumber: input.versionNumber },
      actorId: input.actorId,
    });

    return version;
  }

  async toggleFavorite(companyId: string, skillId: string, userId: string, favorite: boolean) {
    await this.skills.toggleFavorite(companyId, skillId, userId, favorite);
  }
}
