import { format } from "date-fns";
import { FileText } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/auth-context";
import { useKnowledgeDocuments } from "@/hooks/knowledge/use-knowledge-documents";
import { useKnowledgeSources } from "@/hooks/knowledge/use-knowledge-sources";
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

export function KnowledgeDocumentsPage() {
  const { t } = useTranslation("common");
  const { company } = useAuth();
  const companyId = company?.id ?? null;

  const { data: documents = [], isLoading, error } = useKnowledgeDocuments(companyId);
  const { data: sources = [] } = useKnowledgeSources(companyId);

  const sourceNameById = new Map(sources.map((source) => [source.id, source.display_name]));

  if (isLoading) {
    return (
      <DashboardCard className="p-6">
        <DashboardTableSkeleton rows={5} />
      </DashboardCard>
    );
  }

  if (error) {
    return <DashboardErrorBanner message={error.message} />;
  }

  return (
    <DashboardCard className="p-6">
      <h3 className="font-semibold mb-4 flex items-center gap-2">
        <FileText className="w-4 h-4 text-primary" />
        {t("knowledge.documents.listTitle")}
      </h3>

      {documents.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("knowledge.documents.empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground border-b border-white/5">
                <th className="py-3 pe-4">{t("knowledge.documents.columns.title")}</th>
                <th className="py-3 pe-4">{t("knowledge.documents.columns.source")}</th>
                <th className="py-3 pe-4">{t("knowledge.documents.columns.status")}</th>
                <th className="py-3 pe-4">{t("knowledge.documents.columns.mimeType")}</th>
                <th className="py-3 pe-4">{t("knowledge.documents.columns.updated")}</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((document) => {
                const importMeta = getImportMetadata(document.metadata);
                return (
                  <tr key={document.id} className="border-b border-white/5 last:border-0">
                    <td className="py-3 pe-4">
                      <div>
                        <p className="font-medium">{document.title}</p>
                        {importMeta?.file_name ? (
                          <p className="text-xs text-muted-foreground mt-0.5" dir="ltr">
                            {importMeta.file_name}
                          </p>
                        ) : null}
                      </div>
                    </td>
                    <td className="py-3 pe-4">{sourceNameById.get(document.source_id) ?? t("common.none")}</td>
                    <td className="py-3 pe-4 capitalize">{document.status}</td>
                    <td className="py-3 pe-4" dir="ltr">
                      {document.mime_type}
                    </td>
                    <td className="py-3 pe-4" dir="ltr">
                      {format(new Date(document.updated_at), "PPp")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </DashboardCard>
  );
}
