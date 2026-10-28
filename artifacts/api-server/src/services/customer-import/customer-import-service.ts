import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildCustomerPhoneIdentityColumns,
  isImportPhoneWritable,
  resolveImportPhoneIdentity,
} from "@workspace/ai-tool-router";
import { CustomerService, SupabaseCustomerRepository } from "@workspace/automation-platform";
import {
  assertMappingReady,
  buildCustomerImportRowIdempotencyKey,
  buildCustomerImportTemplateBuffer,
  buildErrorReportCsv,
  buildExistingCustomerMatchIndex,
  buildValidationSummary,
  CUSTOMER_IMPORT_LIMITS,
  detectDuplicateCandidates,
  isExampleImportRow,
  listCustomerImportFields,
  parseCustomerImportCsv,
  parseCustomerImportXlsx,
  projectMappedRows,
  suggestFieldMappings,
  templateFileNameForLocale,
  validateMappedRows,
  type CustomerImportDuplicatePolicy,
  type FieldMappingEntry,
  type NormalizedImportRow,
  type ParsedImportWorkbook,
} from "@workspace/customer-import";

function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function stripExampleRows(rows: NormalizedImportRow[]): NormalizedImportRow[] {
  return rows.filter((row) => !isExampleImportRow({ name: row.values.name ?? null }));
}

export class CustomerImportService {
  constructor(private readonly client: SupabaseClient) {}

  listFields() {
    return listCustomerImportFields();
  }

  async buildTemplate(locale?: string | null): Promise<{
    buffer: Buffer;
    fileName: string;
    contentType: string;
  }> {
    const buffer = await buildCustomerImportTemplateBuffer({ locale });
    return {
      buffer,
      fileName: templateFileNameForLocale(locale ?? "en"),
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    };
  }

  async createJob(input: {
    companyId: string;
    userId: string;
    fileName: string;
    fileBase64: string;
    sheetIndex?: number;
    duplicatePolicy?: CustomerImportDuplicatePolicy;
    defaultPhoneRegion?: string | null;
  }) {
    const buffer = Buffer.from(input.fileBase64, "base64");
    if (buffer.byteLength === 0) throw new Error("EMPTY_FILE: Uploaded file is empty.");
    if (buffer.byteLength > CUSTOMER_IMPORT_LIMITS.maxFileBytes) {
      throw new Error(`FILE_TOO_LARGE: Maximum file size is ${CUSTOMER_IMPORT_LIMITS.maxFileBytes} bytes.`);
    }

    const lower = input.fileName.toLowerCase();
    let workbook: ParsedImportWorkbook;
    if (lower.endsWith(".csv")) {
      workbook = parseCustomerImportCsv({ buffer, fileName: input.fileName });
    } else if (lower.endsWith(".xlsx")) {
      workbook = await parseCustomerImportXlsx({
        buffer,
        fileName: input.fileName,
        sheetIndex: input.sheetIndex ?? 0,
      });
    } else {
      throw new Error("UNSUPPORTED_TYPE: Only .csv and .xlsx files are supported.");
    }

    const mappings = suggestFieldMappings(workbook.columns);
    const { data, error } = await this.client
      .from("customer_import_jobs")
      .insert({
        company_id: input.companyId,
        created_by: input.userId,
        status: "parsed",
        source_kind: "csv_xlsx",
        file_name: input.fileName,
        file_size_bytes: buffer.byteLength,
        content_sha256: sha256(buffer),
        selected_sheet_index: workbook.selectedSheetIndex,
        duplicate_policy: input.duplicatePolicy ?? "skip",
        default_phone_region: input.defaultPhoneRegion ?? null,
        mapping_json: mappings,
        worksheets_json: workbook.worksheets,
        columns_json: workbook.columns,
        staged_rows_json: workbook.rows,
        total_rows: workbook.rows.length,
        summary_json: {
          parseWarnings: workbook.warnings,
          sourceKind: workbook.sourceKind,
        },
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return this.serializeJob(data);
  }

  async getJob(companyId: string, jobId: string) {
    const { data, error } = await this.client
      .from("customer_import_jobs")
      .select("*")
      .eq("id", jobId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("JOB_NOT_FOUND: Import job was not found.");
    return this.serializeJob(data);
  }

  async updateMapping(input: {
    companyId: string;
    jobId: string;
    mapping: FieldMappingEntry[];
    duplicatePolicy?: CustomerImportDuplicatePolicy;
    defaultPhoneRegion?: string | null;
    sheetIndex?: number;
    fileBase64?: string;
    fileName?: string;
  }) {
    const job = await this.requireMutableJob(input.companyId, input.jobId);
    let stagedRows = (job.staged_rows_json as Record<string, string>[] | null) ?? [];
    let columns = (job.columns_json as Array<{ index: number; header: string; samples: string[] }>) ?? [];
    let worksheets = job.worksheets_json;
    let selectedSheet = job.selected_sheet_index ?? 0;

    if (typeof input.sheetIndex === "number" && input.fileBase64 && input.fileName?.toLowerCase().endsWith(".xlsx")) {
      const workbook = await parseCustomerImportXlsx({
        buffer: Buffer.from(input.fileBase64, "base64"),
        fileName: input.fileName,
        sheetIndex: input.sheetIndex,
      });
      stagedRows = workbook.rows;
      columns = workbook.columns;
      worksheets = workbook.worksheets;
      selectedSheet = workbook.selectedSheetIndex;
    }

    const ready = assertMappingReady(input.mapping);
    if (!ready.ok) throw new Error(`${ready.code}: ${ready.message}`);

    const { data, error } = await this.client
      .from("customer_import_jobs")
      .update({
        mapping_json: input.mapping,
        duplicate_policy: input.duplicatePolicy ?? job.duplicate_policy,
        default_phone_region:
          input.defaultPhoneRegion === undefined ? job.default_phone_region : input.defaultPhoneRegion,
        staged_rows_json: stagedRows,
        columns_json: columns,
        worksheets_json: worksheets,
        selected_sheet_index: selectedSheet,
        total_rows: stagedRows.length,
        status: "mapped",
        validation_issues_json: [],
        duplicate_candidates_json: [],
        summary_json: {
          ...(typeof job.summary_json === "object" && job.summary_json ? job.summary_json : {}),
          validation: null,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.jobId)
      .eq("company_id", input.companyId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return this.serializeJob(data);
  }

  async validateJob(input: { companyId: string; jobId: string }) {
    const job = await this.requireMutableJob(input.companyId, input.jobId);
    const mappings = (job.mapping_json as FieldMappingEntry[]) ?? [];
    const ready = assertMappingReady(mappings);
    if (!ready.ok) throw new Error(`${ready.code}: ${ready.message}`);

    const workbook: ParsedImportWorkbook = {
      sourceKind: "csv",
      fileName: job.file_name ?? "import",
      fileSizeBytes: job.file_size_bytes ?? 0,
      worksheets: (job.worksheets_json as ParsedImportWorkbook["worksheets"]) ?? [],
      selectedSheetIndex: job.selected_sheet_index ?? 0,
      columns: (job.columns_json as ParsedImportWorkbook["columns"]) ?? [],
      rows: (job.staged_rows_json as Record<string, string>[]) ?? [],
      warnings: [],
    };

    const projected = stripExampleRows(projectMappedRows(workbook, mappings));
    const validated = validateMappedRows(projected, {
      defaultRegion: job.default_phone_region ?? null,
    });

    const emails = validated
      .map((row) => row.values.email)
      .filter((value): value is string => Boolean(value));
    const phones = validated
      .map((row) => row.values.phone)
      .filter((value): value is string => Boolean(value && value.startsWith("+")));

    const existing: Array<{ id: string; email?: string | null; phone_e164?: string | null }> = [];
    if (emails.length > 0) {
      const { data } = await this.client
        .from("customers")
        .select("id, email, phone_e164")
        .eq("company_id", input.companyId)
        .in("email", emails.slice(0, 1000));
      existing.push(...((data ?? []) as typeof existing));
    }
    if (phones.length > 0) {
      const { data } = await this.client
        .from("customers")
        .select("id, email, phone_e164")
        .eq("company_id", input.companyId)
        .in("phone_e164", phones.slice(0, 1000));
      existing.push(...((data ?? []) as typeof existing));
    }

    const duplicates = detectDuplicateCandidates(
      validated,
      buildExistingCustomerMatchIndex(existing),
      (job.duplicate_policy as CustomerImportDuplicatePolicy) ?? "skip",
    );
    const summary = buildValidationSummary(validated, duplicates, mappings);
    const issues = validated.flatMap((row) => row.issues);

    const { data, error } = await this.client
      .from("customer_import_jobs")
      .update({
        status: "validated",
        validation_issues_json: issues,
        duplicate_candidates_json: duplicates,
        staged_rows_json: workbook.rows,
        total_rows: validated.length,
        summary_json: {
          ...(typeof job.summary_json === "object" && job.summary_json ? job.summary_json : {}),
          validation: summary,
          preview: validated.slice(0, CUSTOMER_IMPORT_LIMITS.previewRows).map((row) => ({
            rowNumber: row.rowNumber,
            values: row.values,
            issues: row.issues,
          })),
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.jobId)
      .eq("company_id", input.companyId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return this.serializeJob(data);
  }

  async confirmAndRun(input: {
    companyId: string;
    userId: string;
    jobId: string;
    confirmed: boolean;
    canUpdate: boolean;
  }) {
    if (!input.confirmed) throw new Error("CONFIRMATION_REQUIRED: Explicit confirmation is required.");

    const job = await this.requireMutableJob(input.companyId, input.jobId);
    if (job.status !== "validated" && job.status !== "failed") {
      throw new Error("INVALID_STATE: Validate the import before confirming.");
    }
    if (job.duplicate_policy === "update" && !input.canUpdate) {
      throw new Error("FORBIDDEN_UPDATE: customers.edit is required for update policy.");
    }

    const summary = (job.summary_json as { validation?: { expectedInserts?: number } } | null)?.validation;
    if (!summary) throw new Error("INVALID_STATE: Validation summary missing. Re-validate before import.");

    await this.client
      .from("customer_import_jobs")
      .update({
        status: "running",
        started_at: new Date().toISOString(),
        cancel_requested: false,
        processed_rows: 0,
        created_count: 0,
        updated_count: 0,
        skipped_count: 0,
        flagged_count: 0,
        failed_count: 0,
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.jobId)
      .eq("company_id", input.companyId);

    // Bounded synchronous execution for this release (max 2000 rows).
    void this.executeJob({ companyId: input.companyId, userId: input.userId, jobId: input.jobId }).catch(
      async (error) => {
        await this.client
          .from("customer_import_jobs")
          .update({
            status: "failed",
            error_message: error instanceof Error ? error.message : String(error),
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", input.jobId)
          .eq("company_id", input.companyId);
      },
    );

    return this.getJob(input.companyId, input.jobId);
  }

  async cancelJob(companyId: string, jobId: string) {
    const job = await this.getRawJob(companyId, jobId);
    if (job.status === "running") {
      const { data, error } = await this.client
        .from("customer_import_jobs")
        .update({
          cancel_requested: true,
          status: "cancelling",
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobId)
        .eq("company_id", companyId)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return this.serializeJob(data);
    }
    if (["completed", "failed", "cancelled"].includes(job.status)) {
      return this.serializeJob(job);
    }
    const { data, error } = await this.client
      .from("customer_import_jobs")
      .update({
        status: "cancelled",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId)
      .eq("company_id", companyId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return this.serializeJob(data);
  }

  async getErrorReport(companyId: string, jobId: string): Promise<string> {
    await this.getRawJob(companyId, jobId);
    const { data, error } = await this.client
      .from("customer_import_row_results")
      .select("row_number, status, error_code, error_message")
      .eq("company_id", companyId)
      .eq("job_id", jobId)
      .in("status", ["invalid", "failed", "flagged", "skipped"])
      .order("row_number", { ascending: true })
      .limit(5000);
    if (error) throw new Error(error.message);

    const issues =
      ((await this.getRawJob(companyId, jobId)).validation_issues_json as Array<{
        rowNumber: number;
        field: string | null;
        code: string;
        message: string;
        severity: string;
      }>) ?? [];

    const rows = [
      ...issues.map((issue) => ({
        rowNumber: issue.rowNumber,
        field: issue.field,
        code: issue.code,
        message: issue.message,
        severity: issue.severity,
      })),
      ...((data ?? []) as Array<{
        row_number: number;
        status: string;
        error_code: string | null;
        error_message: string | null;
      }>).map((row) => ({
        rowNumber: row.row_number,
        field: null,
        code: row.error_code ?? row.status,
        message: row.error_message ?? row.status,
        severity: row.status === "flagged" ? "warning" : "error",
      })),
    ];
    return buildErrorReportCsv(rows);
  }

  private async executeJob(input: { companyId: string; userId: string; jobId: string }) {
    const job = await this.getRawJob(input.companyId, input.jobId);
    const mappings = (job.mapping_json as FieldMappingEntry[]) ?? [];
    const workbook: ParsedImportWorkbook = {
      sourceKind: "csv",
      fileName: job.file_name ?? "import",
      fileSizeBytes: job.file_size_bytes ?? 0,
      worksheets: (job.worksheets_json as ParsedImportWorkbook["worksheets"]) ?? [],
      selectedSheetIndex: job.selected_sheet_index ?? 0,
      columns: (job.columns_json as ParsedImportWorkbook["columns"]) ?? [],
      rows: (job.staged_rows_json as Record<string, string>[]) ?? [],
      warnings: [],
    };
    const projected = stripExampleRows(projectMappedRows(workbook, mappings));
    const validated = validateMappedRows(projected, {
      defaultRegion: job.default_phone_region ?? null,
    });
    const duplicates = (job.duplicate_candidates_json as ReturnType<typeof detectDuplicateCandidates>) ?? [];
    const dupByRow = new Map(duplicates.map((dup) => [dup.rowNumber, dup]));
    const policy = (job.duplicate_policy as CustomerImportDuplicatePolicy) ?? "skip";

    const repository = new SupabaseCustomerRepository(this.client);
    const customerService = new CustomerService(repository);

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let flagged = 0;
    let failed = 0;
    let processed = 0;

    for (const row of validated) {
      const latest = await this.getRawJob(input.companyId, input.jobId);
      if (latest.cancel_requested) {
        await this.client
          .from("customer_import_jobs")
          .update({
            status: "cancelled",
            processed_rows: processed,
            created_count: created,
            updated_count: updated,
            skipped_count: skipped,
            flagged_count: flagged,
            failed_count: failed,
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            // Clear staged payload on terminal state for retention hygiene.
            staged_rows_json: null,
          })
          .eq("id", input.jobId)
          .eq("company_id", input.companyId);
        return;
      }

      const idempotencyKey = buildCustomerImportRowIdempotencyKey({
        jobId: input.jobId,
        contentSha256: typeof job.content_sha256 === "string" ? job.content_sha256 : null,
        rowNumber: row.rowNumber,
        values: row.values,
      });

      const existingResult = await this.client
        .from("customer_import_row_results")
        .select("id, status, customer_id")
        .eq("company_id", input.companyId)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (existingResult.data && ["created", "updated", "skipped", "flagged"].includes(existingResult.data.status)) {
        processed += 1;
        if (existingResult.data.status === "created") created += 1;
        if (existingResult.data.status === "updated") updated += 1;
        if (existingResult.data.status === "skipped") skipped += 1;
        if (existingResult.data.status === "flagged") flagged += 1;
        continue;
      }

      const hasError = row.issues.some((issue) => issue.severity === "error");
      if (hasError) {
        failed += 1;
        processed += 1;
        await this.upsertRowResult({
          companyId: input.companyId,
          jobId: input.jobId,
          rowNumber: row.rowNumber,
          status: "invalid",
          idempotencyKey,
          errorCode: row.issues[0]?.code ?? "invalid",
          errorMessage: row.issues[0]?.message ?? "Invalid row",
          payload: row.values,
        });
        continue;
      }

      const dup = dupByRow.get(row.rowNumber);
      if (dup) {
        if (dup.policyAction === "flag" || policy === "flag") {
          flagged += 1;
          processed += 1;
          await this.upsertRowResult({
            companyId: input.companyId,
            jobId: input.jobId,
            rowNumber: row.rowNumber,
            status: "flagged",
            idempotencyKey,
            customerId: dup.existingCustomerId ?? null,
            errorCode: "duplicate_candidate",
            errorMessage: `Duplicate candidate via ${dup.matchKind}`,
            payload: row.values,
          });
          continue;
        }
        if (dup.policyAction === "skip" || policy === "skip") {
          skipped += 1;
          processed += 1;
          await this.upsertRowResult({
            companyId: input.companyId,
            jobId: input.jobId,
            rowNumber: row.rowNumber,
            status: "skipped",
            idempotencyKey,
            customerId: dup.existingCustomerId ?? null,
            errorCode: "duplicate_skip",
            errorMessage: `Skipped existing match via ${dup.matchKind}`,
            payload: row.values,
          });
          continue;
        }
        if (policy === "update" && dup.existingCustomerId) {
          try {
            await this.updateExistingCustomer({
              companyId: input.companyId,
              userId: input.userId,
              customerId: dup.existingCustomerId,
              values: row.values,
              customerService,
            });
            updated += 1;
            processed += 1;
            await this.upsertRowResult({
              companyId: input.companyId,
              jobId: input.jobId,
              rowNumber: row.rowNumber,
              status: "updated",
              idempotencyKey,
              customerId: dup.existingCustomerId,
              payload: row.values,
            });
          } catch (error) {
            failed += 1;
            processed += 1;
            await this.upsertRowResult({
              companyId: input.companyId,
              jobId: input.jobId,
              rowNumber: row.rowNumber,
              status: "failed",
              idempotencyKey,
              errorCode: "update_failed",
              errorMessage: error instanceof Error ? error.message : String(error),
              payload: row.values,
            });
          }
          continue;
        }
      }

      try {
        const phone = row.values.phone ?? null;
        const preview = resolveImportPhoneIdentity({
          phone,
          rowRegion: row.values.phone_region ?? null,
          defaultRegion: job.default_phone_region ?? null,
          source: "import",
        });
        if (phone && !isImportPhoneWritable(preview)) {
          throw new Error(preview.code ?? "invalid_phone");
        }

        const createdCustomer = await customerService.createCustomer({
          companyId: input.companyId,
          userId: input.userId,
          name: row.values.name!,
          email: row.values.email ?? null,
          phone,
          gender: row.values.gender ?? null,
          companyName: row.values.company_name ?? null,
          notes: row.values.notes ?? null,
          source: row.values.source ?? "manual",
          phoneIdentity: preview.identity ?? buildCustomerPhoneIdentityColumns({ phone: null }),
        });

        if (row.values.date_of_birth) {
          await this.client
            .from("customers")
            .update({ date_of_birth: row.values.date_of_birth })
            .eq("id", createdCustomer.customer.id)
            .eq("company_id", input.companyId);
        }

        created += 1;
        processed += 1;
        await this.upsertRowResult({
          companyId: input.companyId,
          jobId: input.jobId,
          rowNumber: row.rowNumber,
          status: "created",
          idempotencyKey,
          customerId: createdCustomer.customer.id,
          payload: row.values,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const isDup = /duplicate|unique constraint/i.test(message);
        if (isDup) {
          skipped += 1;
          processed += 1;
          await this.upsertRowResult({
            companyId: input.companyId,
            jobId: input.jobId,
            rowNumber: row.rowNumber,
            status: "skipped",
            idempotencyKey,
            errorCode: "duplicate_constraint",
            errorMessage: "Skipped due to existing unique customer constraint.",
            payload: row.values,
          });
        } else {
          failed += 1;
          processed += 1;
          await this.upsertRowResult({
            companyId: input.companyId,
            jobId: input.jobId,
            rowNumber: row.rowNumber,
            status: "failed",
            idempotencyKey,
            errorCode: "create_failed",
            errorMessage: message.slice(0, 300),
            payload: row.values,
          });
        }
      }

      if (processed % CUSTOMER_IMPORT_LIMITS.batchSize === 0) {
        await this.client
          .from("customer_import_jobs")
          .update({
            processed_rows: processed,
            created_count: created,
            updated_count: updated,
            skipped_count: skipped,
            flagged_count: flagged,
            failed_count: failed,
            updated_at: new Date().toISOString(),
          })
          .eq("id", input.jobId)
          .eq("company_id", input.companyId);
      }
    }

    await this.client
      .from("customer_import_jobs")
      .update({
        status: "completed",
        processed_rows: processed,
        created_count: created,
        updated_count: updated,
        skipped_count: skipped,
        flagged_count: flagged,
        failed_count: failed,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        staged_rows_json: null,
      })
      .eq("id", input.jobId)
      .eq("company_id", input.companyId);
  }

  private async updateExistingCustomer(input: {
    companyId: string;
    userId: string;
    customerId: string;
    values: NormalizedImportRow["values"];
    customerService: CustomerService;
  }) {
    const updates: Array<[string, string]> = [];
    if (input.values.name) updates.push(["name", input.values.name]);
    if (input.values.email) updates.push(["email", input.values.email]);
    if (input.values.gender) updates.push(["gender", input.values.gender]);
    if (input.values.company_name) updates.push(["company_name", input.values.company_name]);
    if (input.values.notes) updates.push(["notes", input.values.notes]);
    if (input.values.phone) {
      const preview = resolveImportPhoneIdentity({
        phone: input.values.phone,
        rowRegion: input.values.phone_region ?? null,
        source: "import",
      });
      if (!isImportPhoneWritable(preview) || !preview.identity) {
        throw new Error(preview.code ?? "invalid_phone");
      }
      await input.customerService.updateCustomer({
        companyId: input.companyId,
        userId: input.userId,
        customerId: input.customerId,
        field: "phone",
        value: input.values.phone,
        phoneIdentity: preview.identity,
      });
    }
    for (const [field, value] of updates) {
      await input.customerService.updateCustomer({
        companyId: input.companyId,
        userId: input.userId,
        customerId: input.customerId,
        field,
        value,
      });
    }
    if (input.values.date_of_birth) {
      await this.client
        .from("customers")
        .update({ date_of_birth: input.values.date_of_birth })
        .eq("id", input.customerId)
        .eq("company_id", input.companyId);
    }
  }

  private async upsertRowResult(input: {
    companyId: string;
    jobId: string;
    rowNumber: number;
    status: string;
    idempotencyKey: string;
    customerId?: string | null;
    errorCode?: string;
    errorMessage?: string;
    payload: Record<string, unknown>;
  }) {
    const { error } = await this.client.from("customer_import_row_results").upsert(
      {
        company_id: input.companyId,
        job_id: input.jobId,
        row_number: input.rowNumber,
        status: input.status,
        idempotency_key: input.idempotencyKey,
        customer_id: input.customerId ?? null,
        error_code: input.errorCode ?? null,
        error_message: input.errorMessage ?? null,
        payload_json: input.payload,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "job_id,row_number" },
    );
    if (error) throw new Error(error.message);
  }

  private async requireMutableJob(companyId: string, jobId: string) {
    const job = await this.getRawJob(companyId, jobId);
    if (["running", "completed"].includes(job.status)) {
      throw new Error("INVALID_STATE: This import job can no longer be modified.");
    }
    return job;
  }

  private async getRawJob(companyId: string, jobId: string) {
    const { data, error } = await this.client
      .from("customer_import_jobs")
      .select("*")
      .eq("id", jobId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("JOB_NOT_FOUND: Import job was not found.");
    return data;
  }

  private serializeJob(row: Record<string, unknown>) {
    const summary = row.summary_json && typeof row.summary_json === "object" ? row.summary_json : {};
    return {
      id: row.id,
      companyId: row.company_id,
      status: row.status,
      fileName: row.file_name,
      fileSizeBytes: row.file_size_bytes,
      selectedSheetIndex: row.selected_sheet_index,
      duplicatePolicy: row.duplicate_policy,
      defaultPhoneRegion: row.default_phone_region,
      mapping: row.mapping_json ?? [],
      worksheets: row.worksheets_json ?? [],
      columns: row.columns_json ?? [],
      summary,
      validationIssues: row.validation_issues_json ?? [],
      duplicateCandidates: row.duplicate_candidates_json ?? [],
      totalRows: row.total_rows ?? 0,
      processedRows: row.processed_rows ?? 0,
      createdCount: row.created_count ?? 0,
      updatedCount: row.updated_count ?? 0,
      skippedCount: row.skipped_count ?? 0,
      flaggedCount: row.flagged_count ?? 0,
      failedCount: row.failed_count ?? 0,
      errorMessage: row.error_message,
      cancelRequested: row.cancel_requested ?? false,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      limits: CUSTOMER_IMPORT_LIMITS,
      // Never return full staged rows to the browser — preview lives in summary.
      hasStagedRows: Array.isArray(row.staged_rows_json),
    };
  }
}
