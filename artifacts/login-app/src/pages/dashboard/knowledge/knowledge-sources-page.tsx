import { useState } from "react";
import { BookOpen, Loader2, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/auth-context";
import { useCreateKnowledgeSource } from "@/hooks/knowledge/use-create-knowledge-source";
import { useKnowledgeSources } from "@/hooks/knowledge/use-knowledge-sources";
import { useAuthUser } from "@/hooks/use-rbac";
import { canManageKnowledge } from "@/lib/knowledge/knowledge-permissions";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DashboardCard, DashboardErrorBanner, DashboardTableSkeleton } from "@/components/dashboard/ui";

export function KnowledgeSourcesPage() {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const { company } = useAuth();
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const companyId = company?.id ?? null;
  const canManage = canManageKnowledge(hasPermission, isSuperAdmin);

  const { data: sources = [], isLoading, error } = useKnowledgeSources(companyId);
  const createSource = useCreateKnowledgeSource();

  const [displayName, setDisplayName] = useState("");
  const [key, setKey] = useState("");
  const [sourceType, setSourceType] = useState<"manual" | "pdf" | "policy">("pdf");

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!companyId || !displayName.trim() || !key.trim()) return;

    try {
      await createSource.mutateAsync({
        companyId,
        key: key.trim(),
        displayName: displayName.trim(),
        sourceType,
        description: t("knowledge.sources.defaultDescription"),
      });
      setDisplayName("");
      setKey("");
      toast({ title: t("knowledge.sources.createSuccess") });
    } catch (createError) {
      toast({
        variant: "destructive",
        title: t("knowledge.sources.createFailed"),
        description: createError instanceof Error ? createError.message : undefined,
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
      {canManage && (
        <DashboardCard className="p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Plus className="w-4 h-4 text-primary" />
            {t("knowledge.sources.createTitle")}
          </h3>
          <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="source-name">{t("knowledge.sources.displayName")}</Label>
              <Input
                id="source-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="bg-background/50 border-white/10"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="source-key">{t("knowledge.sources.key")}</Label>
              <Input
                id="source-key"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                className="bg-background/50 border-white/10"
                dir="ltr"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="source-type">{t("knowledge.sources.type")}</Label>
              <select
                id="source-type"
                value={sourceType}
                onChange={(e) => setSourceType(e.target.value as "manual" | "pdf" | "policy")}
                className="w-full rounded-xl bg-background/50 border border-white/10 px-3 py-2.5 text-sm"
              >
                <option value="pdf">PDF</option>
                <option value="manual">{t("knowledge.sources.typeManual")}</option>
                <option value="policy">{t("knowledge.sources.typePolicy")}</option>
              </select>
            </div>
            <div className="md:col-span-4 flex justify-end">
              <Button type="submit" disabled={createSource.isPending}>
                {createSource.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t("knowledge.sources.createAction")}
              </Button>
            </div>
          </form>
        </DashboardCard>
      )}

      <DashboardCard className="p-6">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-primary" />
          {t("knowledge.sources.listTitle")}
        </h3>
        {sources.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("knowledge.sources.empty")}</p>
        ) : (
          <div className="space-y-3">
            {sources.map((source) => (
              <div
                key={source.id}
                className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 bg-black/20 rounded-xl border border-white/5"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium">{source.display_name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {source.key} · {source.source_type}
                  </p>
                </div>
                <span
                  className={`text-xs px-2 py-1 rounded-full border ${
                    source.is_enabled
                      ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10"
                      : "border-white/10 text-muted-foreground"
                  }`}
                >
                  {source.is_enabled ? t("knowledge.sources.enabled") : t("knowledge.sources.disabled")}
                </span>
              </div>
            ))}
          </div>
        )}
      </DashboardCard>
    </div>
  );
}
