import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { format } from "date-fns";
import { ar, enUS } from "date-fns/locale";
import { BookOpen, FileUp, Loader2, UploadCloud, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useSearch } from "wouter";
import { useAuth } from "@/context/auth-context";
import { useKnowledgeDocuments } from "@/hooks/knowledge/use-knowledge-documents";
import { useImportKnowledgeDocument, readFileAsBase64 } from "@/hooks/knowledge/use-knowledge-import";
import { useKnowledgeSources } from "@/hooks/knowledge/use-knowledge-sources";
import { useToast } from "@/hooks/use-toast";
import { nestedSectionHref } from "@/lib/routing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DashboardErrorBanner, DashboardPageFallback } from "@/components/dashboard/ui";
import { cn } from "@/lib/utils";

type ImportMetadata = {
  status?: string;
  file_name?: string | null;
  page_count?: number | null;
  parser?: string | null;
  imported_at?: string;
};

function getImportMetadata(metadata: Record<string, unknown>): ImportMetadata | null {
  const value = metadata.import;
  if (!value || typeof value !== "object") return null;
  return value as ImportMetadata;
}

function readSourceQuery(search: string): string {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return params.get("source")?.trim() ?? "";
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function KnowledgeImportPage() {
  const { t, i18n } = useTranslation("common");
  const { toast } = useToast();
  const search = useSearch();
  const { company } = useAuth();
  const companyId = company?.id ?? null;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dateLocale = i18n.language?.startsWith("ar") ? ar : enUS;

  const { data: sources = [] } = useKnowledgeSources(companyId);
  const { data: documents = [], isLoading, error } = useKnowledgeDocuments(companyId);
  const importDocument = useImportKnowledgeDocument();

  const enabledSources = useMemo(() => sources.filter((source) => source.is_enabled), [sources]);

  const [sourceId, setSourceId] = useState("");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [textContent, setTextContent] = useState("");

  useEffect(() => {
    const fromQuery = readSourceQuery(search);
    if (fromQuery && enabledSources.some((source) => source.id === fromQuery)) {
      setSourceId((current) => current || fromQuery);
      return;
    }
    if (enabledSources.length === 1) {
      setSourceId((current) => current || enabledSources[0]!.id);
    }
  }, [search, enabledSources]);

  const importedDocuments = useMemo(
    () =>
      documents
        .filter((document) => getImportMetadata(document.metadata))
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()),
    [documents],
  );

  const hasContent = Boolean(file) || Boolean(textContent.trim());
  const canSubmit = Boolean(companyId && sourceId && hasContent && !importDocument.isPending);

  const clearFile = () => {
    setFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleFileChange = (next: File | null) => {
    if (!next) {
      clearFile();
      return;
    }
    const name = next.name.toLowerCase();
    const allowed =
      next.type === "application/pdf" ||
      next.type === "text/plain" ||
      name.endsWith(".pdf") ||
      name.endsWith(".txt");
    if (!allowed) {
      toast({
        variant: "destructive",
        title: t("knowledge.import.failed"),
        description: t("knowledge.import.validation.unsupportedFile"),
      });
      clearFile();
      return;
    }
    setFile(next);
  };

  const handleImport = async (event: FormEvent) => {
    event.preventDefault();
    if (!companyId || !sourceId) return;

    try {
      if (file) {
        const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
        const base64 = await readFileAsBase64(file);
        await importDocument.mutateAsync({
          companyId,
          sourceId,
          title: title.trim() || file.name.replace(/\.(pdf|txt)$/i, ""),
          rawContent: base64,
          contentEncoding: "base64",
          mimeType: isPdf ? "application/pdf" : file.type || "text/plain",
          fileName: file.name,
        });
      } else if (textContent.trim()) {
        await importDocument.mutateAsync({
          companyId,
          sourceId,
          title: title.trim() || t("knowledge.import.defaultTextTitle"),
          rawContent: textContent,
          mimeType: "text/plain",
          contentEncoding: "text",
        });
      } else {
        throw new Error(t("knowledge.import.validation.noContent"));
      }

      clearFile();
      setTextContent("");
      setTitle("");
      toast({ title: t("knowledge.import.success") });
    } catch (importError) {
      toast({
        variant: "destructive",
        title: t("knowledge.import.failed"),
        description: importError instanceof Error ? importError.message : undefined,
      });
    }
  };

  const statusLabel = (status?: string) => {
    const key = (status ?? "completed").toLowerCase();
    const translated = t(`knowledge.import.status.${key}`, { defaultValue: "" });
    return translated || t("knowledge.import.status.completed");
  };

  if (isLoading) {
    return <DashboardPageFallback />;
  }

  if (error) {
    return <DashboardErrorBanner message={error.message} />;
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{t("knowledge.import.uploadTitle")}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{t("knowledge.import.uploadSubtitle")}</p>
      </div>

      <section className="space-y-4 rounded-2xl border border-border/50 p-5 sm:p-6">
        <h3 className="flex items-center gap-2 font-semibold">
          <UploadCloud className="size-4 text-primary" />
          {t("knowledge.import.uploadTitle")}
        </h3>

        {enabledSources.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/60 px-4 py-8 text-center">
            <BookOpen className="mx-auto size-7 text-muted-foreground" aria-hidden />
            <p className="mt-3 text-sm font-medium">{t("knowledge.import.noSources")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("knowledge.import.noSourcesHint")}</p>
            <Button asChild className="mt-4 rounded-xl">
              <Link href={nestedSectionHref("/")}>{t("knowledge.import.createSourceFirst")}</Link>
            </Button>
          </div>
        ) : (
          <form onSubmit={(event) => void handleImport(event)} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="import-source">{t("knowledge.import.source")}</Label>
                <select
                  id="import-source"
                  value={sourceId}
                  onChange={(event) => setSourceId(event.target.value)}
                  className="w-full rounded-xl border border-border/60 bg-background px-3 py-2.5 text-sm"
                  required
                >
                  <option value="">{t("knowledge.import.selectSource")}</option>
                  {enabledSources.map((source) => (
                    <option key={source.id} value={source.id}>
                      {source.display_name} ({source.source_type})
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="import-title">{t("knowledge.import.documentTitle")}</Label>
                <Input
                  id="import-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder={t("knowledge.import.documentTitlePlaceholder")}
                  className="rounded-xl"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t("knowledge.import.pdfFile")}</Label>
              <input
                ref={fileInputRef}
                id="import-file"
                type="file"
                accept="application/pdf,.pdf,text/plain,.txt"
                className="sr-only"
                onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
              />
              <div
                className={cn(
                  "flex flex-col gap-3 rounded-xl border border-dashed border-border/60 px-4 py-4 sm:flex-row sm:items-center",
                  file ? "border-primary/40 bg-primary/5" : "",
                )}
              >
                <div className="min-w-0 flex-1">
                  {file ? (
                    <>
                      <p className="truncate text-sm font-medium" dir="ltr">
                        {file.name}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground" dir="ltr">
                        {formatFileSize(file.size)}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-medium">{t("knowledge.import.chooseFile")}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {t("knowledge.import.fileHint")}
                      </p>
                    </>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-xl"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <FileUp className="me-2 size-4" />
                    {file ? t("knowledge.import.changeFile") : t("knowledge.import.chooseFile")}
                  </Button>
                  {file ? (
                    <Button
                      type="button"
                      variant="ghost"
                      className="rounded-xl"
                      onClick={clearFile}
                      aria-label={t("knowledge.import.clearFile")}
                    >
                      <X className="size-4" />
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="import-text">{t("knowledge.import.plainText")}</Label>
              <textarea
                id="import-text"
                value={textContent}
                onChange={(event) => setTextContent(event.target.value)}
                rows={5}
                className="w-full rounded-xl border border-border/60 bg-background px-3 py-2.5 text-sm"
                placeholder={t("knowledge.import.plainTextPlaceholder")}
              />
              <p className="text-xs text-muted-foreground">{t("knowledge.import.contentRequiredHint")}</p>
            </div>

            <div className="flex justify-end">
              <Button type="submit" className="rounded-xl" disabled={!canSubmit}>
                {importDocument.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <>
                    <FileUp className="me-2 size-4" />
                    {t("knowledge.import.submit")}
                  </>
                )}
              </Button>
            </div>
          </form>
        )}
      </section>

      <section className="space-y-4 rounded-2xl border border-border/50 p-5 sm:p-6">
        <h3 className="font-semibold">{t("knowledge.import.statusTitle")}</h3>
        {importedDocuments.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("knowledge.import.statusEmpty")}</p>
        ) : (
          <div className="space-y-3">
            {importedDocuments.map((document) => {
              const importMeta = getImportMetadata(document.metadata);
              return (
                <div
                  key={document.id}
                  className="flex flex-col gap-3 rounded-xl border border-border/40 px-4 py-3 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{document.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {importMeta?.file_name ?? document.mime_type}
                      {importMeta?.page_count != null
                        ? ` · ${t("knowledge.import.pageCount", { count: importMeta.page_count })}`
                        : ""}
                    </p>
                  </div>
                  <div className="text-end text-xs text-muted-foreground">
                    <p className="text-emerald-600 dark:text-emerald-400">
                      {statusLabel(importMeta?.status)}
                    </p>
                    {importMeta?.imported_at ? (
                      <p dir="ltr">
                        {format(new Date(importMeta.imported_at), "PPp", { locale: dateLocale })}
                      </p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
