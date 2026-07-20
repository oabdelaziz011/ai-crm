import type { DocumentStatus } from "@workspace/knowledge-platform";
import { Badge } from "@/components/ui/badge";
import { getPublishingMetadata } from "@workspace/knowledge-platform";
import { useTranslation } from "react-i18next";

export type EmbeddingDisplayStatus = "pending" | "queued" | "processing" | "completed" | "failed";

const STATUS_TONES: Record<EmbeddingDisplayStatus, string> = {
  pending: "bg-slate-500/15 text-slate-300 border-slate-500/20",
  queued: "bg-amber-500/15 text-amber-300 border-amber-500/20",
  processing: "bg-orange-500/15 text-orange-300 border-orange-500/20",
  completed: "bg-emerald-500/15 text-emerald-300 border-emerald-500/20",
  failed: "bg-red-500/15 text-red-300 border-red-500/20",
};

function normalizeEmbeddingStatus(value: string | undefined): EmbeddingDisplayStatus {
  if (value === "queued" || value === "processing" || value === "completed" || value === "failed") {
    return value;
  }
  return "pending";
}

export function KnowledgeEmbeddingStatusBadge({
  metadata,
  documentStatus,
}: {
  metadata: Record<string, unknown>;
  documentStatus: DocumentStatus | string;
}) {
  const { t } = useTranslation("common");
  const publishing = getPublishingMetadata(metadata);
  const status = normalizeEmbeddingStatus(publishing.embedding_status);
  const queuedCount = publishing.queue?.queued_job_count;
  const showBadge =
    documentStatus === "published" ||
    documentStatus === "indexing" ||
    documentStatus === "indexed" ||
    publishing.embedding_status != null;

  if (!showBadge) return null;

  return (
    <div className="flex flex-col gap-1">
      <Badge variant="outline" className={STATUS_TONES[status]}>
        {t(`knowledge.documents.embedding.${status}`)}
      </Badge>
      {typeof queuedCount === "number" && queuedCount > 0 ? (
        <span className="text-xs text-muted-foreground">
          {t("knowledge.documents.embedding.queuedChunks", { count: queuedCount })}
        </span>
      ) : null}
    </div>
  );
}
