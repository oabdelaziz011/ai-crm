import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import { DashboardCard, DashboardTableSkeleton } from "@/components/dashboard/ui";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import type {
  PlatformAiOpsEmbeddingJobRow,
  PlatformAiOpsKnowledgeDocument,
  PlatformAiOpsKnowledgeSummary,
} from "@/lib/platform-ai-operations";

type OpsKnowledgeDashboardProps = {
  summary: PlatformAiOpsKnowledgeSummary | undefined;
  documents: PlatformAiOpsKnowledgeDocument[];
  jobs: PlatformAiOpsEmbeddingJobRow[];
  loading?: boolean;
};

export function OpsKnowledgeDashboard({ summary, documents, jobs, loading }: OpsKnowledgeDashboardProps) {
  const { t } = useTranslation("common");

  if (loading && !summary) {
    return <DashboardTableSkeleton rows={6} />;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: t("platformAiOps.knowledge.documents"), value: summary?.documents_total ?? 0 },
          { label: t("platformAiOps.knowledge.indexed"), value: summary?.documents_indexed ?? 0 },
          { label: t("platformAiOps.knowledge.chunks"), value: summary?.chunks_total ?? 0 },
          { label: t("platformAiOps.knowledge.embeddings"), value: summary?.embeddings_active ?? 0 },
        ].map((item) => (
          <DashboardCard key={item.label} className="p-4">
            <p className="text-xs text-muted-foreground">{item.label}</p>
            <p className="text-2xl font-semibold">{item.value.toLocaleString()}</p>
          </DashboardCard>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <DashboardCard className="overflow-hidden">
          <div className="border-b border-border/60 px-5 py-4">
            <h3 className="text-sm font-semibold">{t("platformAiOps.knowledge.documentsFeed")}</h3>
          </div>
          {documents.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">{t("platformAiOps.knowledge.emptyDocuments")}</p>
          ) : (
            <div className="divide-y divide-border/40">
              {documents.map((doc) => (
                <div key={doc.id} className="space-y-1 px-5 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium">{doc.title}</p>
                    <Badge variant="outline" className="text-[10px] capitalize">{doc.status}</Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {doc.company_name} · {doc.chunk_count} {t("platformAiOps.knowledge.chunksLabel")} · {doc.mime_type}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {t("platformAiOps.knowledge.embeddingStatus")}: {doc.embedding_status}
                  </p>
                </div>
              ))}
            </div>
          )}
        </DashboardCard>

        <DashboardCard className="overflow-hidden">
          <div className="border-b border-border/60 px-5 py-4">
            <h3 className="text-sm font-semibold">{t("platformAiOps.knowledge.jobsFeed")}</h3>
            <p className="text-xs text-muted-foreground">
              {t("platformAiOps.knowledge.queueStats", {
                queued: summary?.jobs_queued ?? 0,
                running: summary?.jobs_running ?? 0,
                failed: summary?.jobs_failed ?? 0,
                latency: summary?.avg_indexing_latency_ms ?? 0,
              })}
            </p>
          </div>
          {jobs.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">{t("platformAiOps.knowledge.emptyJobs")}</p>
          ) : (
            <div className="divide-y divide-border/40">
              {jobs.map((job) => (
                <div key={job.id} className="space-y-2 px-5 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium">{job.document_title}</p>
                    <Badge variant="outline" className="shrink-0 text-[10px] capitalize">{job.status}</Badge>
                  </div>
                  <Progress value={Number(job.progress_pct)} className="h-1.5" />
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>{job.company_name}</span>
                    <span>{format(new Date(job.queued_at), "MMM d HH:mm")}</span>
                  </div>
                  {job.error_message && <p className="text-[10px] text-destructive">{job.error_message}</p>}
                </div>
              ))}
            </div>
          )}
        </DashboardCard>
      </div>
    </div>
  );
}
