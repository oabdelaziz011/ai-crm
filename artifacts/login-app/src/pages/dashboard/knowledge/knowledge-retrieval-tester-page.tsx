import { useState } from "react";
import { useTranslation } from "react-i18next";
import { DashboardErrorBanner } from "@/components/dashboard/ui";
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
  const [question, setQuestion] = useState("");
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
    if (!companyId || !question.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const knowledge = runtimeConfig?.knowledgeRetrieval;
      const canVector = Boolean(
        knowledge?.embeddingConnectionId &&
          knowledge?.vectorStoreConnectionId &&
          knowledge?.collectionId,
      );
      // Fall back to keyword FTS when embedding/vector defaults are not configured.
      const effectiveMode =
        searchMode === "keyword" || !canVector
          ? "keyword"
          : searchMode;
      if (!canVector && searchMode !== "keyword") {
        setSearchMode("keyword");
      }

      const started = Date.now();
      const response = await services.knowledge.retrieve(context, {
        companyId,
        question,
        embeddingConnectionId: knowledge?.embeddingConnectionId ?? "",
        vectorStoreConnectionId: knowledge?.vectorStoreConnectionId ?? "",
        collectionId: knowledge?.collectionId ?? "",
        searchMode: effectiveMode,
        rerank: effectiveMode !== "keyword",
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
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{t("knowledge.retrieval.title")}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{t("knowledge.retrieval.subtitle")}</p>
      </div>

      <section className="space-y-4 rounded-2xl border border-border/50 p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs font-medium text-muted-foreground">
            {t("knowledge.retrieval.searchMode")}
          </label>
          <Select value={searchMode} onValueChange={(value) => setSearchMode(value as SearchMode)}>
            <SelectTrigger className="h-9 w-52 rounded-xl">
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

        <Textarea
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          rows={4}
          placeholder={t("knowledge.retrieval.queryPlaceholder")}
          className="rounded-xl"
        />
        <Button
          className="rounded-xl"
          onClick={() => void runRetrievalTest()}
          disabled={loading || !question.trim()}
        >
          {loading ? t("knowledge.retrieval.running") : t("knowledge.retrieval.run")}
        </Button>
        {error ? <DashboardErrorBanner message={error} /> : null}

        {citations.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">{t("knowledge.retrieval.citations")}</h3>
            <div className="space-y-2">
              {citations.map((cite) => (
                <div
                  key={cite.citationId}
                  className="rounded-xl border border-border/50 p-3 text-xs"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{cite.citationId}</Badge>
                    <span className="font-medium">{cite.documentTitle}</span>
                    {cite.pageNumber != null && (
                      <span className="text-muted-foreground">
                        {t("knowledge.retrieval.page", { page: cite.pageNumber })}
                      </span>
                    )}
                    <span className="text-muted-foreground">
                      {t("knowledge.retrieval.confidence", {
                        value: (cite.confidence * 100).toFixed(0),
                      })}
                    </span>
                  </div>
                  {cite.sectionTitle ? (
                    <p className="mt-1 text-muted-foreground">{cite.sectionTitle}</p>
                  ) : null}
                  <p className="mt-1 leading-relaxed">{cite.excerpt}</p>
                  <p className="mt-1 font-mono text-[10px] text-muted-foreground">{cite.chunkId}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <pre className="min-h-[160px] whitespace-pre-wrap rounded-xl border border-border/50 p-3 text-xs text-muted-foreground">
          {result || t("knowledge.retrieval.resultsEmpty")}
        </pre>
      </section>
    </div>
  );
}
