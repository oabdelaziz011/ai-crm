import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  PromptBuildRepository,
  PromptTemplateRepository,
  PromptTemplateVersionRepository,
} from "./prompt-repositories.js";
import type {
  CreatePromptTemplateInput,
  CreatePromptTemplateVersionInput,
  ListPromptTemplatesFilter,
  PromptBuildRecord,
  PromptTemplateRecord,
  PromptTemplateVersionRecord,
} from "../types.js";
import { normalizeOutputContract, parseSectionOrder } from "../utils/compose-prompt.js";

const TEMPLATES_TABLE = "prompt_templates";
const VERSIONS_TABLE = "prompt_template_versions";
const BUILDS_TABLE = "prompt_builds";

function mapTemplate(row: Record<string, unknown>): PromptTemplateRecord {
  return {
    id: row.id as string,
    company_id: (row.company_id as string | null) ?? null,
    key: row.key as string,
    display_name: row.display_name as string,
    description: row.description as string,
    template_type: row.template_type as PromptTemplateRecord["template_type"],
    section_order: parseSectionOrder(row.section_order),
    is_enabled: Boolean(row.is_enabled),
    active_version_id: (row.active_version_id as string | null) ?? null,
    has_unpublished_draft: Boolean(row.has_unpublished_draft),
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function mapVersion(row: Record<string, unknown>): PromptTemplateVersionRecord {
  return {
    id: row.id as string,
    template_id: row.template_id as string,
    version_number: Number(row.version_number),
    version_label: row.version_label as string,
    sections: (row.sections as PromptTemplateVersionRecord["sections"]) ?? {},
    output_contract: normalizeOutputContract(row.output_contract),
    change_notes: row.change_notes as string,
    is_active: Boolean(row.is_active),
    lifecycle_status: (row.lifecycle_status as PromptTemplateVersionRecord["lifecycle_status"]) ?? "published",
    policies: (row.policies as PromptTemplateVersionRecord["policies"]) ?? undefined,
    created_at: row.created_at as string,
    created_by: (row.created_by as string | null) ?? null,
  };
}

function mapBuild(row: Record<string, unknown>): PromptBuildRecord {
  return {
    id: row.id as string,
    company_id: row.company_id as string,
    conversation_id: (row.conversation_id as string | null) ?? null,
    template_id: row.template_id as string,
    template_version_id: row.template_version_id as string,
    template_key: row.template_key as string,
    template_type: row.template_type as PromptBuildRecord["template_type"],
    sections: (row.sections as PromptBuildRecord["sections"]) ?? [],
    final_prompt: row.final_prompt as string,
    output_contract: normalizeOutputContract(row.output_contract),
    created_at: row.created_at as string,
    created_by: (row.created_by as string | null) ?? null,
  };
}

export function createSupabasePromptTemplateRepository(client: SupabaseClient): PromptTemplateRepository {
  return {
    async list(filter: ListPromptTemplatesFilter): Promise<PromptTemplateRecord[]> {
      let query = client.from(TEMPLATES_TABLE).select("*").order("display_name", { ascending: true });
      if (!filter.includeDisabled) query = query.eq("is_enabled", true);

      const { data, error } = await query;
      if (error) throw error;

      let rows = (data ?? []).map((row) => mapTemplate(row as Record<string, unknown>));
      if (filter.companyId) {
        rows = rows.filter(
          (row) => row.company_id === filter.companyId || (filter.includeSystem && row.company_id === null),
        );
      } else if (!filter.includeSystem) {
        rows = rows.filter((row) => row.company_id !== null);
      }
      if (filter.templateType) {
        rows = rows.filter((row) => row.template_type === filter.templateType);
      }
      return rows;
    },

    async findById(id: string): Promise<PromptTemplateRecord | null> {
      const { data, error } = await client.from(TEMPLATES_TABLE).select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return mapTemplate(data as Record<string, unknown>);
    },

    async findByKey(companyId: string | null, key: string): Promise<PromptTemplateRecord | null> {
      let query = client.from(TEMPLATES_TABLE).select("*").eq("key", key);
      if (companyId === null) {
        query = query.is("company_id", null);
      } else {
        const { data: companyData, error: companyError } = await query.eq("company_id", companyId).maybeSingle();
        if (companyError) throw companyError;
        if (companyData) return mapTemplate(companyData as Record<string, unknown>);

        const { data, error } = await client
          .from(TEMPLATES_TABLE)
          .select("*")
          .eq("key", key)
          .is("company_id", null)
          .maybeSingle();
        if (error) throw error;
        if (!data) return null;
        return mapTemplate(data as Record<string, unknown>);
      }

      const { data, error } = await query.maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return mapTemplate(data as Record<string, unknown>);
    },

    async findByType(companyId: string, templateType: string): Promise<PromptTemplateRecord | null> {
      const { data: companyTemplate, error: companyError } = await client
        .from(TEMPLATES_TABLE)
        .select("*")
        .eq("company_id", companyId)
        .eq("template_type", templateType)
        .eq("is_enabled", true)
        .maybeSingle();
      if (companyError) throw companyError;
      if (companyTemplate) return mapTemplate(companyTemplate as Record<string, unknown>);

      const { data, error } = await client
        .from(TEMPLATES_TABLE)
        .select("*")
        .is("company_id", null)
        .eq("template_type", templateType)
        .eq("is_enabled", true)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return mapTemplate(data as Record<string, unknown>);
    },

    async create(input: CreatePromptTemplateInput): Promise<PromptTemplateRecord> {
      const { data, error } = await client
        .from(TEMPLATES_TABLE)
        .insert({
          company_id: input.companyId,
          key: input.key,
          display_name: input.displayName,
          description: input.description ?? "",
          template_type: input.templateType,
          section_order: input.sectionOrder,
          is_enabled: true,
        })
        .select("*")
        .single();
      if (error) throw error;
      return mapTemplate(data as Record<string, unknown>);
    },

    async updateEnabled(templateId: string, isEnabled: boolean): Promise<PromptTemplateRecord> {
      const { data, error } = await client
        .from(TEMPLATES_TABLE)
        .update({ is_enabled: isEnabled })
        .eq("id", templateId)
        .select("*")
        .single();
      if (error) throw error;
      return mapTemplate(data as Record<string, unknown>);
    },

    async setActiveVersion(templateId: string, versionId: string): Promise<PromptTemplateRecord> {
      const { data, error } = await client
        .from(TEMPLATES_TABLE)
        .update({ active_version_id: versionId })
        .eq("id", templateId)
        .select("*")
        .single();
      if (error) throw error;
      return mapTemplate(data as Record<string, unknown>);
    },

    async setLifecycleState(
      templateId: string,
      patch: { hasUnpublishedDraft?: boolean },
    ): Promise<PromptTemplateRecord> {
      const update: Record<string, unknown> = {};
      if (patch.hasUnpublishedDraft !== undefined) {
        update.has_unpublished_draft = patch.hasUnpublishedDraft;
      }
      const { data, error } = await client
        .from(TEMPLATES_TABLE)
        .update(update)
        .eq("id", templateId)
        .select("*")
        .single();
      if (error) throw error;
      return mapTemplate(data as Record<string, unknown>);
    },
  };
}

export function createSupabasePromptTemplateVersionRepository(
  client: SupabaseClient,
): PromptTemplateVersionRepository {
  return {
    async findById(id: string): Promise<PromptTemplateVersionRecord | null> {
      const { data, error } = await client.from(VERSIONS_TABLE).select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return mapVersion(data as Record<string, unknown>);
    },

    async findActiveByTemplateId(templateId: string): Promise<PromptTemplateVersionRecord | null> {
      const { data, error } = await client
        .from(VERSIONS_TABLE)
        .select("*")
        .eq("template_id", templateId)
        .eq("is_active", true)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return mapVersion(data as Record<string, unknown>);
    },

    async listByTemplateId(templateId: string): Promise<PromptTemplateVersionRecord[]> {
      const { data, error } = await client
        .from(VERSIONS_TABLE)
        .select("*")
        .eq("template_id", templateId)
        .order("version_number", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row) => mapVersion(row as Record<string, unknown>));
    },

    async create(input: CreatePromptTemplateVersionInput): Promise<PromptTemplateVersionRecord> {
      const { data: latest, error: latestError } = await client
        .from(VERSIONS_TABLE)
        .select("version_number")
        .eq("template_id", input.templateId)
        .order("version_number", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latestError) throw latestError;

      const nextVersion = latest ? Number(latest.version_number) + 1 : 1;
      if (input.activate) {
        await client.from(VERSIONS_TABLE).update({ is_active: false }).eq("template_id", input.templateId);
      }

      const { data, error } = await client
        .from(VERSIONS_TABLE)
        .insert({
          template_id: input.templateId,
          version_number: nextVersion,
          version_label: input.versionLabel,
          sections: input.sections,
          output_contract: input.outputContract,
          change_notes: input.changeNotes ?? "",
          is_active: input.activate ?? false,
          lifecycle_status: input.lifecycleStatus ?? (input.activate ? "published" : "draft"),
          policies: input.policies ?? {},
          created_by: input.createdBy ?? null,
        })
        .select("*")
        .single();
      if (error) throw error;

      const version = mapVersion(data as Record<string, unknown>);
      if (input.activate) {
        await client
          .from(TEMPLATES_TABLE)
          .update({ active_version_id: version.id })
          .eq("id", input.templateId);
      }
      return version;
    },

    async activate(templateId: string, versionId: string): Promise<PromptTemplateVersionRecord> {
      await client.from(VERSIONS_TABLE).update({ is_active: false }).eq("template_id", templateId);
      const { data, error } = await client
        .from(VERSIONS_TABLE)
        .update({ is_active: true, lifecycle_status: "published" })
        .eq("id", versionId)
        .eq("template_id", templateId)
        .select("*")
        .single();
      if (error) throw error;

      await client.from(TEMPLATES_TABLE).update({ active_version_id: versionId }).eq("id", templateId);
      return mapVersion(data as Record<string, unknown>);
    },
  };
}

export function createSupabasePromptBuildRepository(client: SupabaseClient): PromptBuildRepository {
  return {
    async create(input) {
      const { data, error } = await client
        .from(BUILDS_TABLE)
        .insert({
          company_id: input.companyId,
          conversation_id: input.conversationId ?? null,
          template_id: input.templateId,
          template_version_id: input.templateVersionId,
          template_key: input.templateKey,
          template_type: input.templateType,
          sections: input.sections,
          final_prompt: input.finalPrompt,
          output_contract: input.outputContract,
          created_by: input.createdBy ?? null,
        })
        .select("*")
        .single();
      if (error) throw error;
      return mapBuild(data as Record<string, unknown>);
    },
  };
}
