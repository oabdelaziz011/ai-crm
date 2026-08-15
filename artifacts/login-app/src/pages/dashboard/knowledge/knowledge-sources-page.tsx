import { useLocation } from "wouter";
import { BookOpen, FileUp, Plus, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ModulePurposeBanner } from "@/components/dashboard/module-purpose-banner";
import { useAuth } from "@/context/auth-context";
import { useKnowledgeSources } from "@/hooks/knowledge/use-knowledge-sources";
import { useAuthUser } from "@/hooks/use-rbac";
import { canManageKnowledge } from "@/lib/knowledge/knowledge-permissions";
import { knowledgeCreateHref } from "@/config/knowledge-route-registry";
import { isKnowledgeWizardDraft } from "@/lib/knowledge/knowledge-wizard-draft";
import { nestedSectionHref } from "@/lib/routing";
import { Button } from "@/components/ui/button";
import { DashboardErrorBanner, DashboardPageFallback } from "@/components/dashboard/ui";
import { cn } from "@/lib/utils";

export function KnowledgeSourcesPage() {
  const { t } = useTranslation("common");
  const [, setLocation] = useLocation();
  const { company } = useAuth();
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const companyId = company?.id ?? null;
  const canManage = canManageKnowledge(hasPermission, isSuperAdmin);

  const { data: sources = [], isLoading, error } = useKnowledgeSources(companyId);

  if (isLoading) {
    return <DashboardPageFallback />;
  }

  if (error) {
    return <DashboardErrorBanner message={error.message} />;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{t("knowledge.library.title")}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{t("knowledge.library.subtitle")}</p>
        </div>
        {canManage ? (
          <Button
            className="rounded-xl"
            onClick={() => setLocation(nestedSectionHref(knowledgeCreateHref()))}
          >
            <Sparkles className="me-2 size-4" />
            {t("knowledge.wizard.startCta")}
          </Button>
        ) : null}
      </div>

      <ModulePurposeBanner
        title={t("knowledge.guide.title")}
        body={t("knowledge.guide.body")}
        points={[
          t("knowledge.guide.points.source"),
          t("knowledge.guide.points.import"),
          t("knowledge.guide.points.documents"),
          t("knowledge.guide.points.verify"),
        ]}
        className="shadow-none"
      />

      {!canManage ? (
        <p className="rounded-xl border border-border/50 px-4 py-3 text-sm text-muted-foreground">
          {t("knowledge.sources.manageDenied")}
        </p>
      ) : null}

      {sources.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/50 px-6 py-12 text-center">
          <BookOpen className="mx-auto size-8 text-muted-foreground" aria-hidden />
          <p className="mt-3 text-sm font-medium">{t("knowledge.sources.empty")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("knowledge.wizard.emptyHint")}</p>
          {canManage ? (
            <Button
              className="mt-4 rounded-xl"
              onClick={() => setLocation(nestedSectionHref(knowledgeCreateHref()))}
            >
              <Plus className="me-2 size-4" />
              {t("knowledge.wizard.startCta")}
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          {sources.map((source) => (
            <div
              key={source.id}
              className={cn(
                "flex flex-col gap-3 rounded-2xl border border-border/50 px-4 py-3 sm:flex-row sm:items-center",
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{source.display_name}</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground" dir="ltr">
                  {source.key} · {source.source_type}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {isKnowledgeWizardDraft(source) ? (
                  <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-800 dark:text-amber-200">
                    {t("knowledge.library.draftBadge")}
                  </span>
                ) : null}
                <span
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs",
                    source.is_enabled
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                      : "border-border/60 text-muted-foreground",
                  )}
                >
                  {source.is_enabled ? t("knowledge.sources.enabled") : t("knowledge.sources.disabled")}
                </span>
                {canManage ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="rounded-xl"
                    onClick={() => setLocation(nestedSectionHref(knowledgeCreateHref(source.id)))}
                  >
                    <FileUp className="me-1.5 size-3.5" />
                    {isKnowledgeWizardDraft(source)
                      ? t("knowledge.library.continueDraft")
                      : t("knowledge.library.continueWizard")}
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
