import { format } from "date-fns";
import { Archive, FileText, RefreshCw, RotateCcw, Trash2, UploadCloud } from "lucide-react";
import { useTranslation } from "react-i18next";
import { KnowledgeDocumentStatusBadge } from "@/components/knowledge/knowledge-document-status-badge";
import { KnowledgeEmbeddingStatusBadge } from "@/components/knowledge/knowledge-embedding-status-badge";
import { DashboardCard, DashboardErrorBanner, DashboardTableSkeleton } from "@/components/dashboard/ui";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/auth-context";
import {
  useArchiveKnowledgeDocument,
  useDeleteKnowledgeDocument,
  usePublishKnowledgeDocument,
  useRestoreKnowledgeDocument,
} from "@/hooks/knowledge/use-knowledge-document-lifecycle";
import { useKnowledgeDocuments } from "@/hooks/knowledge/use-knowledge-documents";
import { useKnowledgeSources } from "@/hooks/knowledge/use-knowledge-sources";
import { usePermissions } from "@/hooks/use-rbac";
import {
  canManageKnowledge,
  canPublishKnowledge,
  canViewKnowledge,
} from "@/lib/knowledge/knowledge-permissions";
import type { DocumentStatus } from "@workspace/knowledge-platform";

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
  const { hasPermission, isSuperAdmin } = usePermissions();
  const companyId = company?.id ?? null;

  const canView = canViewKnowledge(hasPermission, isSuperAdmin);
  const canManage = canManageKnowledge(hasPermission, isSuperAdmin);
  const canPublish = canPublishKnowledge(hasPermission, isSuperAdmin);

  const { data: documents = [], isLoading, error } = useKnowledgeDocuments(companyId, undefined, canView);
  const { data: sources = [] } = useKnowledgeSources(companyId, canView);

  const publishMutation = usePublishKnowledgeDocument(companyId);
  const archiveMutation = useArchiveKnowledgeDocument(companyId);
  const restoreMutation = useRestoreKnowledgeDocument(companyId);
  const deleteMutation = useDeleteKnowledgeDocument(companyId);

  const sourceNameById = new Map(sources.map((source) => [source.id, source.display_name]));
  const pendingDocumentId =
    publishMutation.variables ??
    archiveMutation.variables ??
    restoreMutation.variables ??
    deleteMutation.variables ??
    null;

  if (!canView) {
    return <DashboardErrorBanner message={t("knowledge.noPermission")} />;
  }

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

  function renderActions(documentId: string, status: DocumentStatus) {
    const isPending = pendingDocumentId === documentId;
    const disabled = isPending;

    if (status === "draft") {
      return (
        <div className="flex flex-wrap gap-2">
          {canPublish ? (
            <Button
              size="sm"
              variant="secondary"
              disabled={disabled}
              onClick={() => publishMutation.mutate(documentId)}
            >
              <UploadCloud className="w-4 h-4 me-1" />
              {t("knowledge.documents.actions.publish")}
            </Button>
          ) : null}
          {canManage ? (
            <Button
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={() => deleteMutation.mutate(documentId)}
            >
              <Trash2 className="w-4 h-4 me-1" />
              {t("knowledge.documents.actions.delete")}
            </Button>
          ) : null}
        </div>
      );
    }

    if (status === "published" || status === "indexing" || status === "indexed") {
      return (
        <div className="flex flex-wrap gap-2">
          {canManage ? (
            <Button
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={() => archiveMutation.mutate(documentId)}
            >
              <Archive className="w-4 h-4 me-1" />
              {t("knowledge.documents.actions.archive")}
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" disabled title={t("knowledge.documents.actions.reindexDisabled")}>
            <RefreshCw className="w-4 h-4 me-1" />
            {t("knowledge.documents.actions.reindex")}
          </Button>
        </div>
      );
    }

    if (status === "archived") {
      return (
        <div className="flex flex-wrap gap-2">
          {canManage ? (
            <>
              <Button
                size="sm"
                variant="secondary"
                disabled={disabled}
                onClick={() => restoreMutation.mutate(documentId)}
              >
                <RotateCcw className="w-4 h-4 me-1" />
                {t("knowledge.documents.actions.restore")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={disabled}
                onClick={() => deleteMutation.mutate(documentId)}
              >
                <Trash2 className="w-4 h-4 me-1" />
                {t("knowledge.documents.actions.delete")}
              </Button>
            </>
          ) : null}
        </div>
      );
    }

    return null;
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
                <th className="py-3 pe-4">{t("knowledge.documents.columns.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((document) => {
                const importMeta = getImportMetadata(document.metadata);
                return (
                  <tr key={document.id} className="border-b border-white/5 last:border-0 align-top">
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
                    <td className="py-3 pe-4">
                      <div className="flex flex-col gap-1">
                        <KnowledgeDocumentStatusBadge status={document.status} />
                        <KnowledgeEmbeddingStatusBadge
                          metadata={document.metadata}
                          documentStatus={document.status}
                        />
                      </div>
                    </td>
                    <td className="py-3 pe-4" dir="ltr">
                      {document.mime_type}
                    </td>
                    <td className="py-3 pe-4" dir="ltr">
                      {format(new Date(document.updated_at), "PPp")}
                    </td>
                    <td className="py-3 pe-4">{renderActions(document.id, document.status)}</td>
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
