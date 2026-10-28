import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  cancelCustomerImportJob,
  confirmCustomerImportJob,
  createCustomerImportJob,
  downloadCustomerImportErrorReport,
  downloadCustomerImportTemplate,
  fetchCustomerImportMeta,
  getCustomerImportJob,
  saveCustomerImportMapping,
  validateCustomerImportJob,
  type CustomerImportJob,
  CustomerImportClientError,
} from "@/lib/customer-import/customer-import-api";
import { applyManualMapping, type CustomerImportDuplicatePolicy, type FieldMappingEntry } from "@workspace/customer-import";
import { cn } from "@/lib/utils";

type Step =
  | "method"
  | "upload"
  | "mapping"
  | "preview"
  | "confirm"
  | "running"
  | "results";

type CustomerImportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted?: () => void;
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function CustomerImportDialog({ open, onOpenChange, onCompleted }: CustomerImportDialogProps) {
  const { t, i18n } = useTranslation("common");
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("method");
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [job, setJob] = useState<CustomerImportJob | null>(null);
  const [mapping, setMapping] = useState<FieldMappingEntry[]>([]);
  const [policy, setPolicy] = useState<CustomerImportDuplicatePolicy>("skip");
  const [limits, setLimits] = useState<{ maxFileBytes: number; maxRows: number } | null>(null);
  const [connectors, setConnectors] = useState<
    Array<{ id: string; status: string; labelKey: string; descriptionKey: string }>
  >([]);
  const pollRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    void fetchCustomerImportMeta()
      .then((meta) => {
        setLimits(meta.limits);
        setConnectors(meta.connectors);
      })
      .catch(() => undefined);
  }, [open]);

  useEffect(() => {
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, []);

  const reset = () => {
    if (pollRef.current) window.clearInterval(pollRef.current);
    setStep("method");
    setBusy(false);
    setFile(null);
    setJob(null);
    setMapping([]);
    setPolicy("skip");
  };

  const handleClose = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const summary = useMemo(() => {
    const validation = (
      job?.summary as
        | {
            validation?: {
              totalRows?: number;
              validRows?: number;
              errorRows?: number;
              duplicateCandidates?: number;
              expectedInserts?: number;
              expectedUpdates?: number;
              expectedSkips?: number;
              expectedFlags?: number;
              unmappedColumns?: string[];
            };
          }
        | undefined
    )?.validation;
    return validation ?? null;
  }, [job]);

  const previewRows = useMemo(() => {
    const preview = (
      job?.summary as
        | {
            preview?: Array<{
              rowNumber?: number;
              values?: Record<string, string>;
              issues?: Array<{
                rowNumber?: number;
                field?: string | null;
                code?: string;
                message?: string;
                severity?: string;
              }>;
            }>;
          }
        | undefined
    )?.preview;
    return Array.isArray(preview) ? preview : [];
  }, [job]);

  const previewIssues = useMemo(() => {
    const fromJob = Array.isArray(job?.validationIssues) ? job.validationIssues : [];
    if (fromJob.length > 0) return fromJob;
    return previewRows.flatMap((row) =>
      Array.isArray(row.issues)
        ? row.issues.map((issue) => ({
            rowNumber: issue.rowNumber ?? row.rowNumber ?? 0,
            field: issue.field ?? null,
            code: issue.code ?? "",
            message: issue.message ?? "",
            severity: issue.severity ?? "error",
          }))
        : [],
    );
  }, [job, previewRows]);

  const examplesOnly =
    Boolean(job) &&
    (summary?.totalRows ?? job?.totalRows ?? 0) === 0 &&
    previewRows.length === 0;

  const runSafe = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (error) {
      const message =
        error instanceof CustomerImportClientError
          ? error.message
          : error instanceof Error
            ? error.message
            : t("customerImport.errors.generic");
      toast({ title: t("customerImport.errors.title"), description: message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const onDownloadTemplate = () =>
    runSafe(async () => {
      const locale = i18n.language;
      const blob = await downloadCustomerImportTemplate(locale);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = locale.toLowerCase().startsWith("ar")
        ? "valueor-customer-import-template-ar.xlsx"
        : "valueor-customer-import-template-en.xlsx";
      anchor.click();
      URL.revokeObjectURL(url);
    });

  const onUpload = () =>
    runSafe(async () => {
      if (!file) return;
      const created = await createCustomerImportJob({ file, duplicatePolicy: policy });
      setJob(created);
      setMapping(created.mapping);
      setStep("mapping");
    });

  const onSaveMappingAndValidate = () =>
    runSafe(async () => {
      if (!job) return;
      const mapped = await saveCustomerImportMapping({
        jobId: job.id,
        mapping,
        duplicatePolicy: policy,
      });
      const validated = await validateCustomerImportJob(mapped.id);
      setJob(validated);
      setMapping(validated.mapping);
      setStep("preview");
    });

  const onConfirm = () =>
    runSafe(async () => {
      if (!job) return;
      const confirmed = await confirmCustomerImportJob(job.id);
      setJob(confirmed);
      setStep("running");
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = window.setInterval(() => {
        void getCustomerImportJob(job.id)
          .then((latest) => {
            setJob(latest);
            if (["completed", "failed", "cancelled"].includes(latest.status)) {
              if (pollRef.current) window.clearInterval(pollRef.current);
              setStep("results");
              if (latest.status === "completed") onCompleted?.();
            }
          })
          .catch(() => undefined);
      }, 1200);
    });

  const progressPct =
    job && job.totalRows > 0 ? Math.min(100, Math.round((job.processedRows / job.totalRows) * 100)) : 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("customerImport.title")}</DialogTitle>
          <DialogDescription>{t("customerImport.subtitle")}</DialogDescription>
        </DialogHeader>

        {step === "method" ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                className="rounded-2xl border border-border bg-muted/20 p-4 text-start hover:bg-muted/40"
                onClick={() => void onDownloadTemplate()}
                disabled={busy}
              >
                <Download className="mb-2 size-5" />
                <div className="font-medium">{t("customerImport.method.downloadTemplate")}</div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("customerImport.method.downloadTemplateHint")}
                </p>
              </button>
              <button
                type="button"
                className="rounded-2xl border border-border bg-muted/20 p-4 text-start hover:bg-muted/40"
                onClick={() => setStep("upload")}
              >
                <Upload className="mb-2 size-5" />
                <div className="font-medium">{t("customerImport.method.uploadFile")}</div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("customerImport.method.uploadFileHint", {
                    size: formatBytes(limits?.maxFileBytes ?? 5 * 1024 * 1024),
                    rows: limits?.maxRows ?? 2000,
                  })}
                </p>
              </button>
            </div>
            <div className="space-y-2">
              <Label>{t("customerImport.connectors.title")}</Label>
              {connectors
                .filter((connector) => connector.status !== "available")
                .map((connector) => (
                  <div
                    key={connector.id}
                    className="rounded-xl border border-dashed border-border/60 px-3 py-2 text-sm text-muted-foreground"
                  >
                    {t(connector.labelKey)} — {t("customerImport.connectors.planned")}
                  </div>
                ))}
            </div>
          </div>
        ) : null}

        {step === "upload" ? (
          <div className="space-y-4">
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              className="flex w-full flex-col items-center justify-center rounded-2xl border border-dashed border-border px-4 py-10 text-center"
              onClick={() => inputRef.current?.click()}
            >
              <FileSpreadsheet className="mb-2 size-8 text-muted-foreground" />
              <div className="font-medium">{t("customerImport.upload.pick")}</div>
              <p className="mt-1 text-sm text-muted-foreground">{t("customerImport.upload.types")}</p>
            </button>
            {file ? (
              <div className="flex items-center justify-between rounded-xl border px-3 py-2 text-sm">
                <span>
                  {file.name} · {formatBytes(file.size)}
                </span>
                <Button type="button" variant="ghost" size="sm" onClick={() => setFile(null)}>
                  {t("customerImport.upload.remove")}
                </Button>
              </div>
            ) : null}
            <div className="space-y-2">
              <Label>{t("customerImport.policy.label")}</Label>
              <Select value={policy} onValueChange={(value) => setPolicy(value as CustomerImportDuplicatePolicy)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="skip">{t("customerImport.policy.skip")}</SelectItem>
                  <SelectItem value="update">{t("customerImport.policy.update")}</SelectItem>
                  <SelectItem value="flag">{t("customerImport.policy.flag")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        ) : null}

        {step === "mapping" && job ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{t("customerImport.mapping.hint")}</p>
            <div className="max-h-80 space-y-2 overflow-y-auto">
              {mapping.map((entry) => (
                <div
                  key={entry.sourceColumnIndex}
                  className="grid gap-2 rounded-xl border px-3 py-2 sm:grid-cols-[1fr_1fr]"
                >
                  <div>
                    <div className="text-sm font-medium">{entry.sourceHeader}</div>
                    <div className="text-xs text-muted-foreground">
                      {(job.columns.find((column) => column.index === entry.sourceColumnIndex)?.samples ?? [])
                        .slice(0, 2)
                        .join(" · ") || t("customerImport.mapping.noSamples")}
                    </div>
                  </div>
                  <Select
                    value={entry.ignored ? "__ignore__" : entry.targetFieldId ?? "__none__"}
                    onValueChange={(value) => {
                      if (value === "__ignore__") {
                        setMapping((current) =>
                          applyManualMapping(current, entry.sourceColumnIndex, null, true),
                        );
                        return;
                      }
                      if (value === "__none__") {
                        setMapping((current) =>
                          applyManualMapping(current, entry.sourceColumnIndex, null, false),
                        );
                        return;
                      }
                      setMapping((current) =>
                        applyManualMapping(
                          current,
                          entry.sourceColumnIndex,
                          value as FieldMappingEntry["targetFieldId"],
                          false,
                        ),
                      );
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">{t("customerImport.mapping.unmapped")}</SelectItem>
                      <SelectItem value="__ignore__">{t("customerImport.mapping.ignore")}</SelectItem>
                      <SelectItem value="name">{t("customerImport.fields.name.label")}</SelectItem>
                      <SelectItem value="email">{t("customerImport.fields.email.label")}</SelectItem>
                      <SelectItem value="phone">{t("customerImport.fields.phone.label")}</SelectItem>
                      <SelectItem value="phone_region">{t("customerImport.fields.phoneRegion.label")}</SelectItem>
                      <SelectItem value="gender">{t("customerImport.fields.gender.label")}</SelectItem>
                      <SelectItem value="date_of_birth">{t("customerImport.fields.dateOfBirth.label")}</SelectItem>
                      <SelectItem value="notes">{t("customerImport.fields.notes.label")}</SelectItem>
                      <SelectItem value="company_name">{t("customerImport.fields.companyName.label")}</SelectItem>
                      <SelectItem value="source">{t("customerImport.fields.source.label")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {step === "preview" && job ? (
          <div className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-2">
              <Stat label={t("customerImport.summary.total")} value={summary?.totalRows ?? job.totalRows} />
              <Stat label={t("customerImport.summary.valid")} value={summary?.validRows ?? 0} />
              <Stat label={t("customerImport.summary.errors")} value={summary?.errorRows ?? 0} />
              <Stat label={t("customerImport.summary.duplicates")} value={summary?.duplicateCandidates ?? 0} />
              <Stat label={t("customerImport.summary.inserts")} value={summary?.expectedInserts ?? 0} />
              <Stat label={t("customerImport.summary.updates")} value={summary?.expectedUpdates ?? 0} />
              <Stat label={t("customerImport.summary.skips")} value={summary?.expectedSkips ?? 0} />
              <Stat label={t("customerImport.summary.flags")} value={summary?.expectedFlags ?? 0} />
            </div>
            {summary?.unmappedColumns?.length ? (
              <p className="text-sm text-muted-foreground">
                {t("customerImport.summary.unmapped", {
                  columns: summary.unmappedColumns.join(", "),
                })}
              </p>
            ) : null}
            {examplesOnly ? (
              <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">
                {t("customerImport.preview.examplesOnly")}
              </p>
            ) : null}
            <div className="max-h-48 overflow-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-start">
                    <th className="px-2 py-1">#</th>
                    <th className="px-2 py-1">{t("customerImport.fields.name.label")}</th>
                    <th className="px-2 py-1">{t("customerImport.fields.companyName.label")}</th>
                    <th className="px-2 py-1">{t("customerImport.fields.email.label")}</th>
                    <th className="px-2 py-1">{t("customerImport.fields.phone.label")}</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.length === 0 ? (
                    <tr>
                      <td className="px-2 py-3 text-muted-foreground" colSpan={5}>
                        {t("customerImport.preview.empty")}
                      </td>
                    </tr>
                  ) : (
                    previewRows.map((row) => {
                      const values = (row.values ?? {}) as Record<string, string>;
                      const hasError = Array.isArray(row.issues)
                        ? row.issues.some((issue) => issue.severity === "error")
                        : false;
                      return (
                        <tr
                          key={String(row.rowNumber)}
                          className={cn("border-b", hasError && "bg-destructive/5")}
                        >
                          <td className="px-2 py-1">{String(row.rowNumber ?? "")}</td>
                          <td className="px-2 py-1">{values.name ?? ""}</td>
                          <td className="px-2 py-1">{values.company_name ?? ""}</td>
                          <td className="px-2 py-1">{values.email ?? ""}</td>
                          <td className="px-2 py-1">{values.phone ?? ""}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">{t("customerImport.preview.issuesTitle")}</p>
              {previewIssues.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("customerImport.preview.noIssues")}</p>
              ) : (
                <ul className="max-h-40 space-y-1 overflow-auto rounded-xl border px-3 py-2 text-sm">
                  {previewIssues.slice(0, 50).map((issue, index) => (
                    <li
                      key={`${issue.rowNumber}-${issue.code}-${index}`}
                      className={cn(
                        issue.severity === "warning" ? "text-amber-700 dark:text-amber-300" : "text-destructive",
                      )}
                    >
                      {t("customerImport.preview.row", { row: issue.rowNumber })}
                      {issue.field ? ` · ${issue.field}` : ""}
                      {": "}
                      {issue.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}

        {step === "confirm" && job ? (
          <p className="text-sm text-muted-foreground">{t("customerImport.confirm.body")}</p>
        ) : null}

        {step === "running" && job ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Loader2 className="size-4 animate-spin" />
              {t("customerImport.running.label")}
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className={cn("h-full bg-primary transition-all")} style={{ width: `${progressPct}%` }} />
            </div>
            <p className="text-sm text-muted-foreground">
              {t("customerImport.running.progress", {
                processed: job.processedRows,
                total: job.totalRows,
              })}
            </p>
          </div>
        ) : null}

        {step === "results" && job ? (
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <Stat label={t("customerImport.results.created")} value={job.createdCount} />
              <Stat label={t("customerImport.results.updated")} value={job.updatedCount} />
              <Stat label={t("customerImport.results.skipped")} value={job.skippedCount} />
              <Stat label={t("customerImport.results.flagged")} value={job.flaggedCount} />
              <Stat label={t("customerImport.results.failed")} value={job.failedCount} />
              <Stat label={t("customerImport.results.status")} value={job.status} />
            </div>
            {job.errorMessage ? (
              <p className="text-sm text-destructive">{job.errorMessage}</p>
            ) : null}
          </div>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-2">
          {step !== "method" && step !== "running" && step !== "results" ? (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                if (step === "upload") setStep("method");
                else if (step === "mapping") setStep("upload");
                else if (step === "preview") setStep("mapping");
                else if (step === "confirm") setStep("preview");
              }}
            >
              {t("customerImport.actions.back")}
            </Button>
          ) : null}

          {step === "upload" ? (
            <Button type="button" disabled={!file || busy} onClick={() => void onUpload()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              {t("customerImport.actions.continue")}
            </Button>
          ) : null}

          {step === "mapping" ? (
            <Button type="button" disabled={busy} onClick={() => void onSaveMappingAndValidate()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              {t("customerImport.actions.validate")}
            </Button>
          ) : null}

          {step === "preview" ? (
            <Button
              type="button"
              disabled={busy || examplesOnly || (summary?.validRows ?? 0) === 0}
              onClick={() => setStep("confirm")}
            >
              {t("customerImport.actions.reviewConfirm")}
            </Button>
          ) : null}

          {step === "confirm" ? (
            <Button type="button" disabled={busy} onClick={() => void onConfirm()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              {t("customerImport.actions.confirmImport")}
            </Button>
          ) : null}

          {step === "running" ? (
            <Button
              type="button"
              variant="outline"
              disabled={busy || !job}
              onClick={() =>
                void runSafe(async () => {
                  if (!job) return;
                  const cancelled = await cancelCustomerImportJob(job.id);
                  setJob(cancelled);
                })
              }
            >
              {t("customerImport.actions.cancel")}
            </Button>
          ) : null}

          {step === "results" ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  void runSafe(async () => {
                    if (!job) return;
                    const blob = await downloadCustomerImportErrorReport(job.id);
                    const url = URL.createObjectURL(blob);
                    const anchor = document.createElement("a");
                    anchor.href = url;
                    anchor.download = `customer-import-errors-${job.id.slice(0, 8)}.csv`;
                    anchor.click();
                    URL.revokeObjectURL(url);
                  })
                }
              >
                {t("customerImport.actions.downloadErrors")}
              </Button>
              <Button type="button" onClick={() => handleClose(false)}>
                {t("customerImport.actions.done")}
              </Button>
            </>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}
