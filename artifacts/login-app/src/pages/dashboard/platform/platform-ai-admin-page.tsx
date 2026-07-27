import { useMemo, useState, useEffect } from "react";
import { Activity, Bot, KeyRound, Shield, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAuthUser } from "@/hooks/use-rbac";
import { useCompanies } from "@/hooks/use-companies";
import { usePlatformAIProviderServices } from "@/hooks/use-platform-ai-provider";
import { useToast } from "@/hooks/use-toast";

export function PlatformAIAdminPage() {
  const { t } = useTranslation("common");
  const { isSuperAdmin } = useAuthUser();
  const { services, context } = usePlatformAIProviderServices();
  const { data: companies = [] } = useCompanies();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [selectedProviderId, setSelectedProviderId] = useState<string>("");
  const [apiKey, setApiKey] = useState("");
  const [chatModel, setChatModel] = useState("gpt-4o-mini");
  const [embeddingModel, setEmbeddingModel] = useState("text-embedding-3-small");
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");

  const { data: providers = [], isLoading } = useQuery({
    queryKey: ["platform-ai-providers"],
    enabled: isSuperAdmin,
    queryFn: () => services.platform.listProviders(),
  });

  const { data: models = [] } = useQuery({
    queryKey: ["platform-ai-models", selectedProviderId],
    enabled: Boolean(selectedProviderId),
    queryFn: () => services.platform.listModels(selectedProviderId),
  });

  const { data: keys = [] } = useQuery({
    queryKey: ["platform-ai-keys", selectedProviderId],
    enabled: Boolean(selectedProviderId),
    queryFn: () => services.platform.listProviderKeys(context, selectedProviderId),
  });

  const { data: usage = [] } = useQuery({
    queryKey: ["platform-ai-usage"],
    enabled: isSuperAdmin,
    queryFn: () => services.platform.listUsage(undefined, 50),
  });

  const { data: featureFlags = [] } = useQuery({
    queryKey: ["platform-ai-feature-flags", selectedCompanyId],
    enabled: Boolean(selectedCompanyId),
    queryFn: () => services.platform.listFeatureFlags(context, selectedCompanyId),
  });

  const activeProvider = useMemo(
    () => providers.find((provider) => provider.id === selectedProviderId) ?? providers[0] ?? null,
    [providers, selectedProviderId],
  );

  useEffect(() => {
    if (activeProvider && !selectedProviderId) {
      setSelectedProviderId(activeProvider.id);
    }
  }, [activeProvider, selectedProviderId]);

  const saveKey = useMutation({
    mutationFn: async () => {
      if (!activeProvider) throw new Error("No provider selected");
      await services.platform.upsertProviderKey(context, {
        providerId: activeProvider.id,
        apiKey,
      });
    },
    onSuccess: async () => {
      setApiKey("");
      await qc.invalidateQueries({ queryKey: ["platform-ai-keys"] });
      toast({ title: t("platformAi.admin.keySaved") });
    },
    onError: (error) => {
      toast({
        title: t("platformAi.admin.keySaveError"),
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    },
  });

  const saveModels = useMutation({
    mutationFn: async () => {
      if (!activeProvider) throw new Error("No provider selected");
      await services.platform.upsertDefaultModel(context, {
        providerId: activeProvider.id,
        useCase: "chat",
        modelName: chatModel,
      });
      await services.platform.upsertDefaultModel(context, {
        providerId: activeProvider.id,
        useCase: "tool_calling",
        modelName: chatModel,
      });
      await services.platform.upsertDefaultModel(context, {
        providerId: activeProvider.id,
        useCase: "embeddings",
        modelName: embeddingModel,
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["platform-ai-models"] });
      toast({ title: t("platformAi.admin.modelsSaved") });
    },
  });

  const toggleFeature = useMutation({
    mutationFn: async (input: { featureKey: "ai_chat"; enabled: boolean }) => {
      if (!selectedCompanyId) throw new Error("Select a company");
      await services.platform.setFeatureFlag(context, selectedCompanyId, input.featureKey, input.enabled);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["platform-ai-feature-flags"] });
    },
  });

  if (!isSuperAdmin) {
    return (
      <div className="p-6 text-sm text-muted-foreground">{t("platformAi.admin.accessDenied")}</div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("platformAi.admin.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("platformAi.admin.subtitle")}</p>
      </div>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-card/40 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">{t("platformAi.admin.providers")}</h2>
          </div>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : (
            <div className="space-y-2">
              {providers.map((provider) => (
                <button
                  key={provider.id}
                  type="button"
                  onClick={() => setSelectedProviderId(provider.id)}
                  className={`w-full rounded-xl border px-4 py-3 text-left ${
                    activeProvider?.id === provider.id ? "border-primary/40 bg-primary/5" : "border-white/10"
                  }`}
                >
                  <div className="font-medium">{provider.display_name}</div>
                  <div className="text-xs text-muted-foreground">{provider.provider_key}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-white/10 bg-card/40 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">{t("platformAi.admin.apiKeys")}</h2>
          </div>
          <p className="text-sm text-muted-foreground">{t("platformAi.admin.apiKeysHint")}</p>
          {keys[0]?.key_hint ? (
            <p className="text-sm font-mono text-emerald-400">
              {t("platformAi.admin.activeKeyHint", { hint: keys[0].key_hint })}
            </p>
          ) : (
            <p className="text-sm text-amber-400">{t("platformAi.admin.noKeyConfigured")}</p>
          )}
          <div className="space-y-2">
            <Label htmlFor="platform-api-key">{t("platformAi.admin.newApiKey")}</Label>
            <Input
              id="platform-api-key"
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="sk-..."
            />
          </div>
          <Button onClick={() => saveKey.mutate()} disabled={!apiKey.trim() || saveKey.isPending}>
            {t("platformAi.admin.saveKey")}
          </Button>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-card/40 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">{t("platformAi.admin.defaultModels")}</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>{t("platformAi.admin.chatModel")}</Label>
            <Input value={chatModel} onChange={(event) => setChatModel(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t("platformAi.admin.embeddingModel")}</Label>
            <Input value={embeddingModel} onChange={(event) => setEmbeddingModel(event.target.value)} />
          </div>
        </div>
        <Button onClick={() => saveModels.mutate()} disabled={saveModels.isPending}>
          {t("platformAi.admin.saveModels")}
        </Button>
        {models.length > 0 ? (
          <div className="text-xs text-muted-foreground">
            {models.map((model) => `${model.use_case}: ${model.model_name}`).join(" · ")}
          </div>
        ) : null}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-card/40 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">{t("platformAi.admin.featureFlags")}</h2>
          </div>
          <select
            className="w-full rounded-xl border border-white/10 bg-background px-3 py-2 text-sm"
            value={selectedCompanyId}
            onChange={(event) => setSelectedCompanyId(event.target.value)}
          >
            <option value="">{t("platformAi.admin.selectCompany")}</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
          {selectedCompanyId ? (
            <div className="flex items-center justify-between rounded-xl border border-white/10 px-4 py-3">
              <span>{t("platformAi.admin.aiChatFeature")}</span>
              <Switch
                checked={featureFlags.find((flag) => flag.feature_key === "ai_chat")?.is_enabled ?? true}
                onCheckedChange={(checked) =>
                  toggleFeature.mutate({ featureKey: "ai_chat", enabled: checked })
                }
              />
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-white/10 bg-card/40 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">{t("platformAi.admin.usageDashboard")}</h2>
          </div>
          <div className="space-y-2 max-h-72 overflow-auto">
            {usage.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("platformAi.admin.noUsageYet")}</p>
            ) : (
              usage.map((row) => (
                <div key={row.id} className="rounded-xl border border-white/10 px-3 py-2 text-xs">
                  <div className="font-medium">{row.provider_key} · {row.model}</div>
                  <div className="text-muted-foreground">
                    {row.total_tokens} tokens · {row.latency_ms ?? 0}ms · {row.status}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
