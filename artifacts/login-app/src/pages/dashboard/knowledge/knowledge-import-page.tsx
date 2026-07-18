import { useMemo, useState } from "react";
import { format } from "date-fns";
import { FileUp, Loader2, UploadCloud } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/auth-context";
import { useKnowledgeDocuments } from "@/hooks/knowledge/use-knowledge-documents";
import { useImportKnowledgeDocument, readFileAsBase64 } from "@/hooks/knowledge/use-knowledge-import";
import { useKnowledgeSources } from "@/hooks/knowledge/use-knowledge-sources";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DashboardCard, DashboardErrorBanner, DashboardTableSkeleton } from "@/components/dashboard/ui";

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

export function KnowledgeImportPage() {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const { company } = useAuth();
  const companyId = company?.id ?? null;

  const { data: sources = [] } = useKnowledgeSources(companyId);
  const { data: documents = [], isLoading, error } = useKnowledgeDocuments(companyId);
  const importDocument = useImportKnowledgeDocument();

  const pdfSources = useMemo(() => sources.filter((source) => source.is_enabled), [sources]);

  const [sourceId, setSourceId] = useState("");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [textContent, setTextContent] = useState("");

  const importedDocuments = useMemo(
    () =>
      documents
        .filter((document) => getImportMetadata(document.metadata))
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()),
    [documents],
  );

  const handleImport = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!companyId || !sourceId) return;

    try {
      if (file) {
        const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
        const base64 = await readFileAsBase64(file);
        await importDocument.mutateAsync({
          companyId,
          sourceId,
          title: title.trim() || file.name.replace(/\.pdf$/i, ""),
          rawContent: base64,
          contentEncoding: "base64",
          mimeType: isPdf ? "application/pdf" : file.type || "application/octet-stream",
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

      setFile(null);
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

  if (isLoading) {
    return (
      <DashboardCard className="p-6">
        <DashboardTableSkeleton rows={4} />
      </DashboardCard>
    );
  }

  if (error) {
    return <DashboardErrorBanner message={error.message} />;
  }

  return (
    <div className="space-y-6">
      <DashboardCard className="p-6">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <UploadCloud className="w-4 h-4 text-primary" />
          {t("knowledge.import.uploadTitle")}
        </h3>

        {pdfSources.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("knowledge.import.noSources")}</p>
        ) : (
          <form onSubmit={handleImport} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="import-source">{t("knowledge.import.source")}</Label>
                <select
                  id="import-source"
                  value={sourceId}
                  onChange={(e) => setSourceId(e.target.value)}
                  className="w-full rounded-xl bg-background/50 border border-white/10 px-3 py-2.5 text-sm"
                  required
                >
                  <option value="">{t("knowledge.import.selectSource")}</option>
                  {pdfSources.map((source) => (
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
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t("knowledge.import.documentTitlePlaceholder")}
                  className="bg-background/50 border-white/10"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="import-file">{t("knowledge.import.pdfFile")}</Label>
              <Input
                id="import-file"
                type="file"
                accept="application/pdf,.pdf,text/plain"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="bg-background/50 border-white/10"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="import-text">{t("knowledge.import.plainText")}</Label>
              <textarea
                id="import-text"
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                rows={5}
                className="w-full rounded-xl bg-background/50 border border-white/10 px-3 py-2.5 text-sm"
                placeholder={t("knowledge.import.plainTextPlaceholder")}
              />
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={importDocument.isPending || !sourceId}>
                {importDocument.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <FileUp className="w-4 h-4 me-2" />
                    {t("knowledge.import.submit")}
                  </>
                )}
              </Button>
            </div>
          </form>
        )}
      </DashboardCard>

      <DashboardCard className="p-6">
        <h3 className="font-semibold mb-4">{t("knowledge.import.statusTitle")}</h3>
        {importedDocuments.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("knowledge.import.statusEmpty")}</p>
        ) : (
          <div className="space-y-3">
            {importedDocuments.map((document) => {
              const importMeta = getImportMetadata(document.metadata);
              return (
                <div
                  key={document.id}
                  className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 bg-black/20 rounded-xl border border-white/5"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{document.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {importMeta?.file_name ?? document.mime_type}
                      {importMeta?.page_count != null ? ` · ${importMeta.page_count} pages` : ""}
                    </p>
                  </div>
                  <div className="text-xs text-muted-foreground text-end">
                    <p className="capitalize text-emerald-400">{importMeta?.status ?? "completed"}</p>
                    {importMeta?.imported_at ? (
                      <p dir="ltr">{format(new Date(importMeta.imported_at), "PPp")}</p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DashboardCard>
    </div>
  );
}
