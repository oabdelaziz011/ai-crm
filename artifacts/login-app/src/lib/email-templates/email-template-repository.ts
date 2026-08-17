import { supabase } from "@/lib/supabase";
import {
  isValidEmailTemplateCode,
  normalizeEmailTemplateCode,
  type CompanyEmailTemplate,
  type EmailTemplateInput,
} from "./types";

type Row = {
  id: string;
  company_id: string;
  name: string;
  code: string;
  subject: string;
  body: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

function mapRow(row: Row): CompanyEmailTemplate {
  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    code: row.code,
    subject: row.subject,
    body: row.body,
    enabled: row.enabled !== false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
  };
}

function validateInput(input: EmailTemplateInput): EmailTemplateInput {
  const name = input.name.trim();
  const code = normalizeEmailTemplateCode(input.code);
  if (!name) throw new Error("Template name is required.");
  if (!isValidEmailTemplateCode(code)) {
    throw new Error("Template code must be lowercase letters, numbers, _ or - (max 64).");
  }
  return {
    name,
    code,
    subject: input.subject ?? "",
    body: input.body ?? "",
    enabled: input.enabled !== false,
  };
}

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export class EmailTemplateRepository {
  async list(companyId: string): Promise<CompanyEmailTemplate[]> {
    const { data, error } = await supabase
      .from("company_email_templates")
      .select(
        "id, company_id, name, code, subject, body, enabled, created_at, updated_at, created_by, updated_by",
      )
      .eq("company_id", companyId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data as Row[] | null)?.map(mapRow) ?? [];
  }

  async create(companyId: string, input: EmailTemplateInput): Promise<CompanyEmailTemplate> {
    const payload = validateInput(input);
    const userId = await currentUserId();
    const { data, error } = await supabase
      .from("company_email_templates")
      .insert({
        company_id: companyId,
        name: payload.name,
        code: payload.code,
        subject: payload.subject,
        body: payload.body,
        enabled: payload.enabled,
        created_by: userId,
        updated_by: userId,
      })
      .select(
        "id, company_id, name, code, subject, body, enabled, created_at, updated_at, created_by, updated_by",
      )
      .single();
    if (error) throw new Error(error.message);
    return mapRow(data as Row);
  }

  async update(
    companyId: string,
    id: string,
    input: EmailTemplateInput,
  ): Promise<CompanyEmailTemplate> {
    const payload = validateInput(input);
    const userId = await currentUserId();
    const { data, error } = await supabase
      .from("company_email_templates")
      .update({
        name: payload.name,
        code: payload.code,
        subject: payload.subject,
        body: payload.body,
        enabled: payload.enabled,
        updated_by: userId,
      })
      .eq("id", id)
      .eq("company_id", companyId)
      .select(
        "id, company_id, name, code, subject, body, enabled, created_at, updated_at, created_by, updated_by",
      )
      .single();
    if (error) throw new Error(error.message);
    return mapRow(data as Row);
  }

  async setEnabled(companyId: string, id: string, enabled: boolean): Promise<CompanyEmailTemplate> {
    const userId = await currentUserId();
    const { data, error } = await supabase
      .from("company_email_templates")
      .update({ enabled, updated_by: userId })
      .eq("id", id)
      .eq("company_id", companyId)
      .select(
        "id, company_id, name, code, subject, body, enabled, created_at, updated_at, created_by, updated_by",
      )
      .single();
    if (error) throw new Error(error.message);
    return mapRow(data as Row);
  }

  async duplicate(companyId: string, id: string): Promise<CompanyEmailTemplate> {
    const { data: existing, error: loadError } = await supabase
      .from("company_email_templates")
      .select(
        "id, company_id, name, code, subject, body, enabled, created_at, updated_at, created_by, updated_by",
      )
      .eq("id", id)
      .eq("company_id", companyId)
      .single();
    if (loadError) throw new Error(loadError.message);
    const row = existing as Row;
    const base = normalizeEmailTemplateCode(`${row.code}_copy`);
    let code = base;
    for (let i = 2; i < 50; i += 1) {
      const { data: clash } = await supabase
        .from("company_email_templates")
        .select("id")
        .eq("company_id", companyId)
        .eq("code", code)
        .maybeSingle();
      if (!clash) break;
      code = normalizeEmailTemplateCode(`${base}_${i}`);
    }
    return this.create(companyId, {
      name: `${row.name} (copy)`,
      code,
      subject: row.subject,
      body: row.body,
      enabled: row.enabled,
    });
  }

  async remove(companyId: string, id: string): Promise<void> {
    const { error } = await supabase
      .from("company_email_templates")
      .delete()
      .eq("id", id)
      .eq("company_id", companyId);
    if (error) throw new Error(error.message);
  }
}

export const emailTemplateRepository = new EmailTemplateRepository();
