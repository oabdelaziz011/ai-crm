import { useTranslation } from "react-i18next";
import { DashboardCard, DashboardErrorBanner } from "@/components/dashboard/ui";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/context/auth-context";
import { useRuntimeChatConfig } from "@/hooks/ai-chat/use-runtime-chat-config";
import { useRetrievalServices } from "@/lib/retrieval-engine";
import { usePermissions } from "@/hooks/use-rbac";
import { canViewKnowledge } from "@/lib/knowledge/knowledge-permissions";
import { useState } from "react";

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
  const [result, setResult] = useState<string>("");
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
      const response = await services.knowledge.retrieve(context, {
        companyId,
        question,
        embeddingConnectionId: knowledge.embeddingConnectionId,
        vectorStoreConnectionId: knowledge.vectorStoreConnectionId,
        collectionId: knowledge.collectionId ?? "",
      });
      setResult(response.contextText || t("knowledge.retrieval.noResults"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("knowledge.retrieval.failed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <DashboardCard className="p-6 space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{t("knowledge.retrieval.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("knowledge.retrieval.subtitle")}</p>
      </div>
      <Textarea value={question} onChange={(event) => setQuestion(event.target.value)} rows={4} />
      <Button onClick={runRetrievalTest} disabled={loading}>
        {loading ? t("knowledge.retrieval.running") : t("knowledge.retrieval.run")}
      </Button>
      {error ? <DashboardErrorBanner message={error} /> : null}
      <pre className="rounded-md bg-muted p-3 text-xs whitespace-pre-wrap min-h-[160px]">{result}</pre>
    </DashboardCard>
  );
}
