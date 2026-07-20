import type { DocumentStatus } from "@workspace/knowledge-platform";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "react-i18next";

const STATUS_TONES: Record<DocumentStatus, string> = {
  draft: "bg-slate-500/15 text-slate-300 border-slate-500/20",
  published: "bg-emerald-500/15 text-emerald-300 border-emerald-500/20",
  indexing: "bg-amber-500/15 text-amber-300 border-amber-500/20",
  indexed: "bg-blue-500/15 text-blue-300 border-blue-500/20",
  archived: "bg-violet-500/15 text-violet-300 border-violet-500/20",
};

export type { DocumentStatus };

export function KnowledgeDocumentStatusBadge({ status }: { status: DocumentStatus | string }) {
  const { t } = useTranslation("common");
  const normalized = (status in STATUS_TONES ? status : "draft") as DocumentStatus;
  const tone = STATUS_TONES[normalized] ?? STATUS_TONES.draft;
  return (
    <Badge variant="outline" className={tone}>
      {t(`knowledge.documents.status.${normalized}`)}
    </Badge>
  );
}
