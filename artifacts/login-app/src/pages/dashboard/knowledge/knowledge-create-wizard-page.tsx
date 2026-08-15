import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useLocation, useSearch } from "wouter";
import {
  ArrowLeft,
  ArrowRight,
  FileText,
  FileUp,
  Loader2,
  Search,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { ModulePurposeBanner } from "@/components/dashboard/module-purpose-banner";
import { DashboardErrorBanner } from "@/components/dashboard/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { knowledgeCreateHref } from "@/config/knowledge-route-registry";
import { useAuth } from "@/context/auth-context";
import { useRuntimeChatConfig } from "@/hooks/ai-chat/use-runtime-chat-config";
import { useCreateKnowledgeSource } from "@/hooks/knowledge/use-create-knowledge-source";
import { useKnowledgeDocuments } from "@/hooks/knowledge/use-knowledge-documents";
import { usePublishKnowledgeDocument } from "@/hooks/knowledge/use-knowledge-document-lifecycle";
import { useImportKnowledgeDocument, readFileAsBase64 } from "@/hooks/knowledge/use-knowledge-import";
import { useKnowledgeSources } from "@/hooks/knowledge/use-knowledge-sources";
import { useUpdateKnowledgeSource } from "@/hooks/knowledge/use-update-knowledge-source";
import { useAuthUser } from "@/hooks/use-rbac";
import { useToast } from "@/hooks/use-toast";
import {
  buildKnowledgeWizardDraftMeta,
  knowledgeWizardStepIndex,
  readKnowledgeWizardDraft,
  type KnowledgeWizardStep,
} from "@/lib/knowledge/knowledge-wizard-draft";
import {
  canImportKnowledge,
  canManageKnowledge,
  canPublishKnowledge,
} from "@/lib/knowledge/knowledge-permissions";
import {
  buildArabicAnswerPrompt,
  containsArabic,
  pickArabicVerifyAnswer,
  resolveKnowledgeVerifySearchQuery,
} from "@/lib/knowledge/knowledge-verify-locale";
import { slugifyKnowledgeSourceKey } from "@/lib/knowledge/slugify-source-key";
import { useAIProviderServices } from "@/lib/ai-provider-layer";
import { useRetrievalServices } from "@/lib/retrieval-engine";
import { nestedSectionHref } from "@/lib/routing";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { createPlatformAIProviderServices } from "@workspace/platform-ai-provider";
import type { KnowledgeCitation } from "@workspace/retrieval-engine";

const STEPS: KnowledgeWizardStep[] = ["source", "import", "documents", "verify"];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function readSourceQuery(search: string): string {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return params.get("source")?.trim() ?? "";
}

export function KnowledgeCreateWizardPage() {
  const { t, i18n } = useTranslation("common");
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { company, user } = useAuth();
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const companyId = company?.id ?? null;
  const canManage = canManageKnowledge(hasPermission, isSuperAdmin);
  const canImport = canImportKnowledge(hasPermission, isSuperAdmin);
  const canPublish = canPublishKnowledge(hasPermission, isSuperAdmin);

  const createSource = useCreateKnowledgeSource();
  const updateSource = useUpdateKnowledgeSource(companyId);
  const importDocument = useImportKnowledgeDocument();
  const publishDocument = usePublishKnowledgeDocument(companyId);
  const { data: allSources = [] } = useKnowledgeSources(companyId);
  const { services: retrievalServices, context: retrievalContext } = useRetrievalServices();
  const { services: providerServices, context: providerContext } = useAIProviderServices();
  const platformAiServices = useMemo(() => createPlatformAIProviderServices(supabase), []);
  const runtimeConfigQuery = useRuntimeChatConfig(companyId, true);
  const runtimeConfig = runtimeConfigQuery.data;

  const [stepIndex, setStepIndex] = useState(0);
  const [displayName, setDisplayName] = useState("");
  const [key, setKey] = useState("");
  const [keyTouched, setKeyTouched] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [textContent, setTextContent] = useState("");
  const [createdSourceId, setCreatedSourceId] = useState<string | null>(null);
  const [createdSourceName, setCreatedSourceName] = useState("");
  const [importSucceeded, setImportSucceeded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resumeReady, setResumeReady] = useState(false);

  const [question, setQuestion] = useState("");
  const [retrievalLoading, setRetrievalLoading] = useState(false);
  const [retrievalError, setRetrievalError] = useState<string | null>(null);
  const [retrievalResult, setRetrievalResult] = useState("");
  const [citations, setCitations] = useState<KnowledgeCitation[]>([]);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [usedSearchMode, setUsedSearchMode] = useState<"hybrid" | "keyword" | null>(null);
  const [answerIsArabic, setAnswerIsArabic] = useState(false);
  const [verifyEmptyReason, setVerifyEmptyReason] = useState<"none" | "no_hits" | "language_mismatch">(
    "none",
  );

  const fileInputRef = useRef<HTMLInputElement>(null);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const topAnchorRef = useRef<HTMLDivElement>(null);

  const step = STEPS[stepIndex]!;
  const hasContent = Boolean(file) || Boolean(textContent.trim());

  const {
    data: sourceDocuments = [],
    isLoading: documentsLoading,
    refetch: refetchDocuments,
  } = useKnowledgeDocuments(companyId, createdSourceId ?? undefined, Boolean(createdSourceId));

  const recentDocs = useMemo(
    () =>
      [...sourceDocuments].sort(
        (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
      ),
    [sourceDocuments],
  );

  const uiIsArabic = i18n.language?.toLowerCase().startsWith("ar");

  const sampleQuestions = useMemo(() => {
    const fromTitles = recentDocs
      .map((document) => document.title?.trim())
      .filter((title): title is string => Boolean(title))
      .slice(0, 1)
      .map((title) =>
        uiIsArabic
          ? t("knowledge.wizard.verifySampleArabicFromTitle", { title })
          : t("knowledge.wizard.verifySampleFromTitle", { title }),
      );
    const localized = uiIsArabic
      ? [
          t("knowledge.wizard.verifySampleArabicPolicy"),
          t("knowledge.wizard.verifySampleArabicHours"),
          t("knowledge.wizard.verifySampleArabicOverview"),
        ]
      : [
          t("knowledge.wizard.verifySampleEnglishPolicy"),
          t("knowledge.wizard.verifySampleEnglishHours"),
        ];
    return [...fromTitles, ...localized].filter(
      (value, index, list) => list.indexOf(value) === index,
    );
  }, [recentDocs, t, uiIsArabic]);

  const questionLooksArabic = containsArabic(question);
  const docsLookEnglish = recentDocs.some((document) => /[A-Za-z]/.test(document.title ?? ""));

  useEffect(() => {
    stepHeadingRef.current?.focus({ preventScroll: true });
    topAnchorRef.current?.scrollIntoView({ block: "start" });
  }, [stepIndex]);

  // Resume draft anytime via ?source=
  useEffect(() => {
    if (resumeReady) return;
    const fromQuery = readSourceQuery(search);
    if (!fromQuery) {
      setResumeReady(true);
      return;
    }
    if (!allSources.length) return;

    const existing = allSources.find((source) => source.id === fromQuery);
    if (!existing) {
      setResumeReady(true);
      return;
    }

    const draft = readKnowledgeWizardDraft(existing);
    setCreatedSourceId(existing.id);
    setCreatedSourceName(existing.display_name);
    setDisplayName(existing.display_name);
    setKey(existing.key);
    setKeyTouched(true);
    setStepIndex(draft ? knowledgeWizardStepIndex(draft.step) : 1);
    setResumeReady(true);
  }, [allSources, search, resumeReady]);

  useEffect(() => {
    if (recentDocs.length > 0) setImportSucceeded(true);
  }, [recentDocs.length]);

  if (!canManage) {
    return <DashboardErrorBanner message={t("knowledge.sources.manageDenied")} />;
  }

  const syncDraftUrl = (sourceId: string) => {
    const href = nestedSectionHref(knowledgeCreateHref(sourceId));
    setLocation(href, { replace: true });
  };

  const persistDraftMeta = async (
    sourceId: string,
    nextStep: KnowledgeWizardStep,
    status: "draft" | "ready" = "draft",
  ) => {
    const existing = allSources.find((source) => source.id === sourceId);
    await updateSource.mutateAsync({
      sourceId,
      metadata: {
        ...(existing?.metadata ?? {}),
        wizard: buildKnowledgeWizardDraftMeta(nextStep, status),
      },
    });
  };

  const handleDisplayNameChange = (value: string) => {
    setDisplayName(value);
    if (!keyTouched) {
      setKey(value.trim() ? slugifyKnowledgeSourceKey(value) : "");
    }
  };

  const clearFile = () => {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileChange = (next: File | null) => {
    if (!next) {
      clearFile();
      return;
    }
    const name = next.name.toLowerCase();
    const allowed =
      next.type === "application/pdf" ||
      next.type === "text/plain" ||
      name.endsWith(".pdf") ||
      name.endsWith(".txt");
    if (!allowed) {
      toast({
        variant: "destructive",
        title: t("knowledge.import.failed"),
        description: t("knowledge.import.validation.unsupportedFile"),
      });
      clearFile();
      return;
    }
    setFile(next);
  };

  const goToStep = (index: number) => {
    setStepIndex(Math.max(0, Math.min(STEPS.length - 1, index)));
  };

  const ensureDraftSource = async (): Promise<{ id: string; name: string } | null> => {
    if (!companyId || !displayName.trim()) return null;

    if (createdSourceId) {
      const existing = allSources.find((source) => source.id === createdSourceId);
      await updateSource.mutateAsync({
        sourceId: createdSourceId,
        displayName: displayName.trim(),
        metadata: {
          ...(existing?.metadata ?? {}),
          wizard: buildKnowledgeWizardDraftMeta(step === "source" ? "import" : step, "draft"),
        },
      });
      setCreatedSourceName(displayName.trim());
      return { id: createdSourceId, name: displayName.trim() };
    }

    const resolvedKey = key.trim() || slugifyKnowledgeSourceKey(displayName);
    const created = await createSource.mutateAsync({
      companyId,
      key: resolvedKey,
      displayName: displayName.trim(),
      sourceType: "pdf",
      description: t("knowledge.sources.defaultDescription"),
      metadata: {
        wizard: buildKnowledgeWizardDraftMeta("import", "draft"),
      },
    });
    setCreatedSourceId(created.id);
    setCreatedSourceName(created.display_name);
    syncDraftUrl(created.id);
    return { id: created.id, name: created.display_name };
  };

  const publishIfAllowed = async (documentId: string) => {
    if (!canPublish) return;
    try {
      await publishDocument.mutateAsync(documentId);
    } catch {
      // Keyword verify can still work on draft after migration 252; do not block the wizard.
    }
  };

  const ensureSourceDocsSearchable = async () => {
    const drafts = sourceDocuments.filter((document) => document.status === "draft");
    if (drafts.length === 0) return;
    for (const document of drafts) {
      await publishIfAllowed(document.id);
    }
    await refetchDocuments();
  };

  const runImport = async (sourceId: string) => {
    if (!companyId || !canImport || !hasContent) return false;
    const imported = file
      ? await (async () => {
          const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
          const base64 = await readFileAsBase64(file);
          return importDocument.mutateAsync({
            companyId,
            sourceId,
            title: file.name.replace(/\.(pdf|txt)$/i, ""),
            rawContent: base64,
            contentEncoding: "base64",
            mimeType: isPdf ? "application/pdf" : file.type || "text/plain",
            fileName: file.name,
          });
        })()
      : await importDocument.mutateAsync({
          companyId,
          sourceId,
          title: t("knowledge.import.defaultTextTitle"),
          rawContent: textContent.trim(),
          mimeType: "text/plain",
          contentEncoding: "text",
        });
    await publishIfAllowed(imported.document.id);
    return true;
  };

  const handleSourceNext = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!displayName.trim()) return;
    setBusy(true);
    try {
      const source = await ensureDraftSource();
      if (!source) return;
      await persistDraftMeta(source.id, "import", "draft");
      toast({ title: t("knowledge.wizard.draftSaved") });
      goToStep(1);
    } catch (error) {
      toast({
        variant: "destructive",
        title: t("knowledge.sources.createFailed"),
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  const handleImportNext = async (skipContent: boolean) => {
    if (!displayName.trim() && !createdSourceId) return;
    setBusy(true);
    try {
      const source = await ensureDraftSource();
      if (!source) return;

      let imported = importSucceeded;
      if (!skipContent && hasContent) {
        imported = await runImport(source.id);
        if (imported) {
          clearFile();
          setTextContent("");
          toast({ title: t("knowledge.import.success") });
        }
      } else {
        toast({ title: t("knowledge.wizard.draftSaved") });
      }

      setImportSucceeded(imported);
      await persistDraftMeta(source.id, "documents", "draft");
      await refetchDocuments();
      goToStep(2);
    } catch (error) {
      toast({
        variant: "destructive",
        title: t("knowledge.import.failed"),
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  const handleDocumentsNext = async () => {
    if (!createdSourceId) return;
    setBusy(true);
    try {
      await ensureSourceDocsSearchable();
      await persistDraftMeta(createdSourceId, "verify", "draft");
      toast({ title: t("knowledge.wizard.draftSaved") });
      goToStep(3);
    } catch (error) {
      toast({
        variant: "destructive",
        title: t("knowledge.wizard.draftSaveFailed"),
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  const handleSaveDraftExit = async () => {
    if (!displayName.trim() && !createdSourceId) {
      toast({
        variant: "destructive",
        title: t("knowledge.wizard.draftNeedsName"),
      });
      return;
    }
    setBusy(true);
    try {
      const source = await ensureDraftSource();
      if (!source) return;
      await persistDraftMeta(source.id, step, "draft");
      toast({ title: t("knowledge.wizard.draftSaved") });
      setLocation(nestedSectionHref("/"));
    } catch (error) {
      toast({
        variant: "destructive",
        title: t("knowledge.wizard.draftSaveFailed"),
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  const markReady = async () => {
    if (!createdSourceId) return;
    await persistDraftMeta(createdSourceId, "verify", "ready");
  };

  const synthesizeArabicAnswer = async (
    ask: string,
    hits: KnowledgeCitation[],
  ): Promise<string | null> => {
    if (!companyId || !runtimeConfig?.providerConnectionId || hits.length === 0) return null;
    try {
      const connections = await providerServices.registry.listConnections(providerContext, {
        companyId,
        isEnabled: true,
      });
      const connection = connections.find((item) => item.id === runtimeConfig.providerConnectionId);
      if (!connection) return null;
      const providerKey = connection.ai_provider_definition?.key ?? "openai";
      const runtime = await platformAiServices.platform.resolveRuntimeConfig(
        companyId,
        providerKey,
        "chat",
      );
      if (!runtime.apiKey) return null;

      const response = await providerServices.gateway.chatCompletion({
        providerKey: runtime.providerKey,
        model: runtime.model,
        temperature: 0.2,
        maxTokens: 500,
        messages: [
          {
            role: "system",
            content:
              "You are a company knowledge assistant. Answer only in Arabic. Always summarize related policies/rules found in the provided passages; never claim there is no information when passages mention policies, trials, refunds, support rules, or similar topics.",
          },
          { role: "user", content: buildArabicAnswerPrompt(ask, hits) },
        ],
        context: {
          companyId,
          userId: user?.id ?? null,
        },
        metadata: {
          apiKey: runtime.apiKey,
          baseUrl: runtime.baseUrl,
          companyId,
          usesPlatformKey: runtime.usesPlatformKey,
        },
      });
      return response.text?.trim() || null;
    } catch {
      return null;
    }
  };

  const runRetrievalTest = async () => {
    if (!companyId || !question.trim()) return;
    setRetrievalLoading(true);
    setRetrievalError(null);
    setUsedSearchMode(null);
    setAnswerIsArabic(false);
    setVerifyEmptyReason("none");
    try {
      // Fresh imports stay draft until publish; make them searchable before verify.
      await ensureSourceDocsSearchable();

      const knowledge = runtimeConfig?.knowledgeRetrieval;
      const canHybrid = Boolean(
        knowledge?.embeddingConnectionId &&
          knowledge?.vectorStoreConnectionId &&
          knowledge?.collectionId,
      );
      // Without embedding/vector defaults, fall back to keyword (FTS) so verify still works.
      const searchMode = canHybrid ? "hybrid" : "keyword";
      setUsedSearchMode(searchMode);

      const { searchQueries, wantsArabicAnswer } = resolveKnowledgeVerifySearchQuery(
        question,
        recentDocs.map((document) => document.title ?? ""),
      );

      // Try short queries one-by-one — FTS ANDs every word in a single query.
      let hits: KnowledgeCitation[] = [];
      let contextText = "";
      let confidenceValue: number | null = null;
      for (const searchQuery of searchQueries) {
        const response = await retrievalServices.knowledge.retrieve(retrievalContext, {
          companyId,
          question: searchQuery,
          embeddingConnectionId: knowledge?.embeddingConnectionId ?? "",
          vectorStoreConnectionId: knowledge?.vectorStoreConnectionId ?? "",
          collectionId: knowledge?.collectionId ?? "",
          searchMode,
          rerank: canHybrid,
          sourceIds: createdSourceId ? [createdSourceId] : undefined,
        });
        const nextHits = response.citations ?? [];
        if (nextHits.length > 0 || Boolean(response.contextText?.trim())) {
          hits = nextHits;
          contextText = response.contextText ?? "";
          confidenceValue = response.confidence ?? null;
          break;
        }
      }

      const hasHits = hits.length > 0 || Boolean(contextText.trim());
      if (!hasHits) {
        setVerifyEmptyReason(
          searchMode === "keyword" && wantsArabicAnswer && docsLookEnglish
            ? "language_mismatch"
            : "no_hits",
        );
        setRetrievalResult("");
        setCitations([]);
        setConfidence(null);
      } else {
        setCitations(hits);
        setConfidence(confidenceValue);
        if (wantsArabicAnswer) {
          const modelAnswer = await synthesizeArabicAnswer(question.trim(), hits);
          setRetrievalResult(pickArabicVerifyAnswer(modelAnswer, hits));
          setAnswerIsArabic(true);
        } else {
          setRetrievalResult(contextText || t("knowledge.retrieval.noResults"));
          setAnswerIsArabic(false);
        }
      }
      await markReady();
    } catch (err) {
      setRetrievalError(err instanceof Error ? err.message : t("knowledge.retrieval.failed"));
    } finally {
      setRetrievalLoading(false);
    }
  };

  const canProceed = () => {
    if (step === "source") return Boolean(displayName.trim());
    if (step === "import") return Boolean(createdSourceId) || Boolean(displayName.trim());
    if (step === "documents") return Boolean(createdSourceId);
    return true;
  };

  return (
    <div ref={topAnchorRef} className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          className="rounded-xl"
          onClick={() => setLocation(nestedSectionHref("/"))}
        >
          <ArrowLeft className="me-2 size-4" />
          {t("knowledge.wizard.backToSources")}
        </Button>
        <div className="text-end">
          {createdSourceId ? (
            <p className="text-xs text-muted-foreground">{t("knowledge.wizard.draftBadge")}</p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {t("knowledge.wizard.stepOf", { current: stepIndex + 1, total: STEPS.length })}
          </p>
        </div>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("knowledge.wizard.title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("knowledge.wizard.subtitle")}</p>
      </div>

      <ModulePurposeBanner
        title={t("knowledge.wizard.guide.title")}
        body={t("knowledge.wizard.guide.body")}
        points={[
          t("knowledge.wizard.guide.points.source"),
          t("knowledge.wizard.guide.points.import"),
          t("knowledge.wizard.guide.points.documents"),
          t("knowledge.wizard.guide.points.verify"),
        ]}
        className="shadow-none"
      />

      <nav aria-label={t("knowledge.wizard.stepsNav")} className="overflow-x-auto">
        <ol className="flex w-full min-w-max items-stretch justify-between gap-1 border-b border-border/60 pb-px">
          {STEPS.map((wizardStep, index) => {
            const active = index === stepIndex;
            const done = index < stepIndex;
            return (
              <li key={wizardStep} className="flex-1">
                <button
                  type="button"
                  disabled={index > stepIndex}
                  onClick={() => {
                    if (index <= stepIndex) goToStep(index);
                  }}
                  className={cn(
                    "relative w-full px-2 py-2.5 text-start text-sm transition-colors",
                    active
                      ? "font-semibold text-foreground"
                      : done
                        ? "text-foreground/80"
                        : "text-muted-foreground",
                  )}
                >
                  <span className="me-1.5 text-xs tabular-nums text-muted-foreground">
                    {index + 1}.
                  </span>
                  {t(`knowledge.wizard.steps.${wizardStep}`)}
                  {active ? (
                    <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <section className="w-full space-y-6 rounded-2xl border border-border/50 p-5 sm:p-6 lg:p-8">
        <div>
          <h2 ref={stepHeadingRef} tabIndex={-1} className="text-base font-semibold outline-none">
            {t(`knowledge.wizard.steps.${step}`)}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t(`knowledge.wizard.stepHints.${step}`)}
          </p>
        </div>

        {step === "source" ? (
          <form className="grid max-w-xl gap-4" onSubmit={(event) => void handleSourceNext(event)}>
            <div className="space-y-1.5">
              <Label htmlFor="wizard-source-name">{t("knowledge.sources.displayName")}</Label>
              <Input
                id="wizard-source-name"
                value={displayName}
                onChange={(event) => handleDisplayNameChange(event.target.value)}
                placeholder={t("knowledge.sources.displayNamePlaceholder")}
                className="rounded-xl"
                autoFocus
                required
              />
              <p className="text-xs text-muted-foreground">{t("knowledge.wizard.sourceBusinessHint")}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wizard-source-key">{t("knowledge.sources.key")}</Label>
              <Input
                id="wizard-source-key"
                value={key}
                onChange={(event) => {
                  setKeyTouched(true);
                  setKey(event.target.value);
                }}
                placeholder={t("knowledge.sources.keyPlaceholder")}
                className="rounded-xl"
                dir="ltr"
              />
              <p className="text-xs text-muted-foreground">{t("knowledge.sources.keyHint")}</p>
            </div>
          </form>
        ) : null}

        {step === "import" ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t("knowledge.wizard.importForSource", {
                name: createdSourceName || displayName || "—",
              })}
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf,text/plain,.txt"
              className="sr-only"
              onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
            />
            <div
              className={cn(
                "flex flex-col gap-3 rounded-xl border border-dashed border-border/60 px-4 py-5 sm:flex-row sm:items-center",
                file ? "border-primary/40 bg-primary/5" : "",
              )}
            >
              <div className="min-w-0 flex-1">
                {file ? (
                  <>
                    <p className="truncate text-sm font-medium" dir="ltr">
                      {file.name}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground" dir="ltr">
                      {formatFileSize(file.size)}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium">{t("knowledge.import.chooseFile")}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t("knowledge.wizard.contentFileHint")}
                    </p>
                  </>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <FileUp className="me-2 size-4" />
                  {file ? t("knowledge.import.changeFile") : t("knowledge.import.chooseFile")}
                </Button>
                {file ? (
                  <Button type="button" variant="ghost" className="rounded-xl" onClick={clearFile}>
                    <X className="size-4" />
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="wizard-text">{t("knowledge.import.plainText")}</Label>
              <textarea
                id="wizard-text"
                value={textContent}
                onChange={(event) => setTextContent(event.target.value)}
                rows={5}
                className="w-full rounded-xl border border-border/60 bg-background px-3 py-2.5 text-sm"
                placeholder={t("knowledge.wizard.contentTextPlaceholder")}
              />
            </div>
          </div>
        ) : null}

        {step === "documents" ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t("knowledge.wizard.documentsBusinessHint", {
                name: createdSourceName || displayName,
              })}
            </p>
            {documentsLoading ? (
              <p className="text-sm text-muted-foreground">{t("knowledge.wizard.documentsLoading")}</p>
            ) : recentDocs.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/60 px-4 py-8 text-center">
                <FileText className="mx-auto size-7 text-muted-foreground" aria-hidden />
                <p className="mt-3 text-sm font-medium">{t("knowledge.wizard.documentsEmpty")}</p>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-4 rounded-xl"
                  onClick={() => goToStep(1)}
                >
                  {t("knowledge.wizard.backToImport")}
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {recentDocs.map((document) => (
                  <div
                    key={document.id}
                    className="flex flex-col gap-2 rounded-xl border border-border/50 px-4 py-3 sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{document.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {document.mime_type} · {document.status}
                      </p>
                    </div>
                    <Badge variant="outline" className="w-fit">
                      {t(`knowledge.documents.status.${document.status}`, {
                        defaultValue: document.status,
                      })}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {step === "verify" ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{t("knowledge.wizard.verifyBusinessHint")}</p>
            {!runtimeConfig?.knowledgeRetrieval ? (
              <p className="rounded-xl border border-border/50 px-3 py-2 text-xs text-muted-foreground">
                {t("knowledge.wizard.verifyKeywordFallbackHint")}
              </p>
            ) : null}
            {questionLooksArabic && docsLookEnglish && usedSearchMode === "keyword" ? (
              <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
                {t("knowledge.wizard.verifyArabicKeywordHint")}
              </p>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="wizard-question">{t("knowledge.wizard.verifyQuestion")}</Label>
              <Textarea
                id="wizard-question"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                rows={3}
                dir={questionLooksArabic ? "rtl" : "ltr"}
                className="rounded-xl"
                placeholder={t("knowledge.wizard.verifyQuestionPlaceholder")}
              />
              {sampleQuestions.length > 0 ? (
                <div className="flex flex-wrap gap-2 pt-1" dir={uiIsArabic ? "rtl" : "ltr"}>
                  {sampleQuestions.map((sample) => (
                    <Button
                      key={sample}
                      type="button"
                      size="sm"
                      variant="outline"
                      className="rounded-xl"
                      dir={containsArabic(sample) ? "rtl" : "ltr"}
                      onClick={() => setQuestion(sample)}
                    >
                      {sample}
                    </Button>
                  ))}
                </div>
              ) : null}
            </div>
            <Button
              type="button"
              className="rounded-xl"
              disabled={retrievalLoading || !question.trim()}
              onClick={() => void runRetrievalTest()}
            >
              {retrievalLoading ? (
                <Loader2 className="me-2 size-4 animate-spin" />
              ) : (
                <Search className="me-2 size-4" />
              )}
              {t("knowledge.wizard.runVerify")}
            </Button>
            {retrievalError ? <DashboardErrorBanner message={retrievalError} /> : null}
            <div className="flex flex-wrap gap-2">
              {usedSearchMode ? (
                <Badge variant="outline">
                  {usedSearchMode === "hybrid"
                    ? t("knowledge.wizard.verifyModeHybrid")
                    : t("knowledge.wizard.verifyModeKeyword")}
                </Badge>
              ) : null}
              {confidence != null ? (
                <Badge variant="outline">
                  {t("knowledge.retrieval.confidence", { value: (confidence * 100).toFixed(0) })}
                </Badge>
              ) : null}
            </div>
            {retrievalResult ? (
              <div className="space-y-2">
                <p className="text-sm font-semibold">{t("knowledge.wizard.verifyAnswerLabel")}</p>
                <pre
                  dir={answerIsArabic ? "rtl" : "ltr"}
                  className="min-h-[120px] whitespace-pre-wrap rounded-xl border border-border/50 p-3 text-sm text-foreground"
                >
                  {retrievalResult}
                </pre>
              </div>
            ) : (
              <pre className="min-h-[120px] whitespace-pre-wrap rounded-xl border border-border/50 p-3 text-xs text-muted-foreground">
                {verifyEmptyReason === "language_mismatch"
                  ? t("knowledge.wizard.verifyEmptyLanguageMismatch")
                  : verifyEmptyReason === "no_hits"
                    ? t("knowledge.wizard.verifyEmptyNoHits")
                    : t("knowledge.wizard.verifyResultsEmpty")}
              </pre>
            )}
            {citations.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm font-semibold">{t("knowledge.retrieval.citations")}</p>
                <p className="text-xs text-muted-foreground">{t("knowledge.wizard.verifyCitationsHint")}</p>
                {citations.slice(0, 3).map((cite) => (
                  <div key={cite.citationId} className="rounded-xl border border-border/50 p-3 text-xs">
                    <p className="font-medium">{cite.documentTitle}</p>
                    <p className="mt-1 text-muted-foreground" dir="ltr">
                      {cite.excerpt}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2 border-t border-border/50 pt-4">
              <Button
                className="rounded-xl"
                onClick={() => {
                  void markReady().finally(() => setLocation("~/dashboard/agents/new"));
                }}
              >
                {t("knowledge.wizard.assignEmployee")}
              </Button>
              <Button
                variant="outline"
                className="rounded-xl"
                onClick={() => {
                  void markReady().finally(() => setLocation(nestedSectionHref("/")));
                }}
              >
                {t("knowledge.wizard.viewSources")}
              </Button>
            </div>
          </div>
        ) : null}

        {step !== "verify" ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/50 pt-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="rounded-xl"
                disabled={stepIndex === 0 || busy}
                onClick={() => goToStep(Math.max(0, stepIndex - 1))}
              >
                {t("knowledge.wizard.back")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="rounded-xl"
                disabled={busy || (!displayName.trim() && !createdSourceId)}
                onClick={() => void handleSaveDraftExit()}
              >
                {t("knowledge.wizard.saveDraftExit")}
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {step === "import" ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="rounded-xl"
                  disabled={busy || !canProceed()}
                  onClick={() => void handleImportNext(true)}
                >
                  {t("knowledge.wizard.skipUpload")}
                </Button>
              ) : null}
              <Button
                type="button"
                className="rounded-xl"
                disabled={busy || !canProceed()}
                onClick={() => {
                  if (step === "source") void handleSourceNext();
                  else if (step === "import") void handleImportNext(false);
                  else if (step === "documents") void handleDocumentsNext();
                }}
              >
                {busy ? <Loader2 className="me-2 size-4 animate-spin" /> : null}
                {step === "import" && hasContent
                  ? t("knowledge.wizard.saveAndContinue")
                  : t("knowledge.wizard.next")}
                <ArrowRight className="ms-2 size-4" />
              </Button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
