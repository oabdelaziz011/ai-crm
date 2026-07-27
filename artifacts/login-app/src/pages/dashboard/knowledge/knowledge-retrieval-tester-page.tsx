import { useState } from "react";
import { useTranslation } from "react-i18next";
import { DashboardCard, DashboardErrorBanner } from "@/components/dashboard/ui";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/context/auth-context";
import { useRuntimeChatConfig } from "@/hooks/ai-chat/use-runtime-chat-config";
import { useRetrievalServices } from "@/lib/retrieval-engine";
import { usePermissions } from "@/hooks/use-rbac";
import { canViewKnowledge } from "@/lib/knowledge/knowledge-permissions";
import type { KnowledgeCitation } from "@workspace/retrieval-engine";

type SearchMode = "vector" | "keyword" | "hybrid";

export function KnowledgeRetrievalTesterPage() {
  const { t } = useTranslation("common");
  const { company } = useAuth();
  const { hasPermission, isSuperAdmin } = usePermissions();
  const companyId = company?.id ?? null;
  const canView = canViewKnowledge(hasPermission, isSuperAdmin);
  const { services, context } = useRetrievalServices();
  const runtimeConfigQuery = useRuntimeChatConfig(companyId, true);
  const runtimeConfig = runtimeConfigQuery.data;
  const [question, setQuestion] = useState("What are your business hours?");
  const [searchMode, setSearchMode] = useState<SearchMode>("hybrid");
  const [result, setResult] = useState<string>("");
  const [citations, setCitations] = useState<KnowledgeCitation[]>([]);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canView) {
    return <DashboardErrorBanner message={t("knowledge.noPermission")} />;
  }

  async function runRetrievalTest() {
    const knowledge = runtimeConfig?.knowledgeRetrieval;
    if (!companyId || !knowledge?.embeddingConnectionId || !knowledge?.vectorStoreConnectionId) {
      setError(t("knowledge.retrieval.missingConnections"));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const started = Date.now();
      const response = await services.knowledge.retrieve(context, {
        companyId,
        question,
        embeddingConnectionId: knowledge.embeddingConnectionId,
        vectorStoreConnectionId: knowledge.vectorStoreConnectionId,
        collectionId: knowledge.collectionId ?? "",
        searchMode,
        rerank: true,
      });
      setResult(response.contextText || t("knowledge.retrieval.noResults"));
      setCitations(response.citations ?? []);
      setConfidence(response.confidence ?? null);
      setLatencyMs(response.retrievalLatencyMs ?? Date.now() - started);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("knowledge.retrieval.failed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <DashboardCard className="space-y-4 p-6">
      <div>
        <h2 className="text-lg font-semibold">{t("knowledge.retrieval.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("knowledge.retrieval.subtitle")}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs font-medium text-muted-foreground">{t("knowledge.retrieval.searchMode")}</label>
        <Select value={searchMode} onValueChange={(value) => setSearchMode(value as SearchMode)}>
          <SelectTrigger className="h-8 w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="hybrid">{t("knowledge.retrieval.modeHybrid")}</SelectItem>
            <SelectItem value="vector">{t("knowledge.retrieval.modeVector")}</SelectItem>
            <SelectItem value="keyword">{t("knowledge.retrieval.modeKeyword")}</SelectItem>
          </SelectContent>
        </Select>
        {confidence != null && (
          <Badge variant="outline" className="text-xs">
            {t("knowledge.retrieval.confidence", { value: (confidence * 100).toFixed(0) })}
          </Badge>
        )}
        {latencyMs != null && (
          <Badge variant="outline" className="text-xs">
            {t("knowledge.retrieval.latency", { ms: latencyMs })}
          </Badge>
        )}
      </div>

      <Textarea value={question} onChange={(event) => setQuestion(event.target.value)} rows={4} />
      <Button onClick={runRetrievalTest} disabled={loading}>
        {loading ? t("knowledge.retrieval.running") : t("knowledge.retrieval.run")}
      </Button>
      {error ? <DashboardErrorBanner message={error} /> : null}

      {citations.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">{t("knowledge.retrieval.citations")}</h3>
          <div className="space-y-2">
            {citations.map((cite) => (
              <div key={cite.citationId} className="rounded-md border border-border/60 bg-muted/20 p-3 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{cite.citationId}</Badge>
                  <span className="font-medium">{cite.documentTitle}</span>
                  {cite.pageNumber != null && (
                    <span className="text-muted-foreground">{t("knowledge.retrieval.page", { page: cite.pageNumber })}</span>
                  )}
                  <span className="text-muted-foreground">
                    {t("knowledge.retrieval.confidence", { value: (cite.confidence * 100).toFixed(0) })}
                  </span>
                </div>
                {cite.sectionTitle && <p className="mt-1 text-muted-foreground">{cite.sectionTitle}</p>}
                <p className="mt-1 leading-relaxed">{cite.excerpt}</p>
                <p className="mt-1 font-mono text-[10px] text-muted-foreground">{cite.chunkId}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <pre className="min-h-[160px] whitespace-pre-wrap rounded-md bg-muted p-3 text-xs">{result}</pre>
    </DashboardCard>
  );
}
