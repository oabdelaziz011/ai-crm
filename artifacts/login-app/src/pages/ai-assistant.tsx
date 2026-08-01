import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight,
  Bot,
  BookOpen,
  Clock,
  Loader2,
  MessageSquare,
  Plug,
  Save,
  Shield,
  Sparkles,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/auth-context";
import { useAuthUser } from "@/hooks/use-rbac";
import { getDashboardRouteById } from "@/config/dashboard-route-registry";
import { PlatformManagedProviderStatus } from "@/components/ai-assistant/platform-managed-provider-status";
import { useKnowledgeFeatureEnabled, useAnalyticsFeatureEnabled, useWorkflowFeatureEnabled } from "@/hooks/platform-ai/use-platform-ai-feature-enabled";
import {
  useAiAssistantSettings,
  useCreateAiAssistantSettings,
  useUpdateAiAssistantSettings,
} from "@/hooks/use-ai-assistant-settings";
import { shouldShowKnowledgeAssistantTab } from "@/lib/platform-ai/knowledge-access";
import { shouldShowAnalyticsIntegration } from "@/lib/platform-ai/analytics-access";
import { isAutomationRouteAccessible } from "@/lib/platform-ai/workflow-access";
import type {
  AiAssistantLanguage,
  AiAssistantProvider,
  AiAssistantResponseLanguage,
  AiAssistantSettings,
  AiAssistantSettingsUpdate,
  AiAssistantTone,
} from "@/lib/types";

type SettingsDraft = {
  is_enabled: boolean;
  provider: AiAssistantProvider;
  model: string;
  temperature: number;
  max_tokens: number;
  response_language: AiAssistantResponseLanguage;
  assistant_name: string;
  assistant_avatar: string;
  language: AiAssistantLanguage;
  personality: string;
  tone: AiAssistantTone;
  welcome_message: string;
  fallback_message: string;
  working_hours_enabled: boolean;
  allow_auto_booking: boolean;
  allow_reschedule: boolean;
  allow_cancellation: boolean;
  handoff_to_human: boolean;
  knowledge_enabled: boolean;
  remember_conversation: boolean;
  conversation_timeout_minutes: number;
  max_conversation_age: number;
};

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-white/10 bg-card/40 p-5 backdrop-blur-sm ${className}`}>
      {children}
    </div>
  );
}

function settingsToDraft(settings: AiAssistantSettings): SettingsDraft {
  return {
    is_enabled: settings.is_enabled,
    provider: settings.provider,
    model: settings.model,
    temperature: settings.temperature,
    max_tokens: settings.max_tokens,
    response_language: settings.response_language,
    assistant_name: settings.assistant_name,
    assistant_avatar: settings.assistant_avatar ?? "",
    language: settings.language,
    personality: settings.personality,
    tone: settings.tone,
    welcome_message: settings.welcome_message,
    fallback_message: settings.fallback_message,
    working_hours_enabled: settings.working_hours_enabled,
    allow_auto_booking: settings.allow_auto_booking,
    allow_reschedule: settings.allow_reschedule,
    allow_cancellation: settings.allow_cancellation,
    handoff_to_human: settings.handoff_to_human,
    knowledge_enabled: settings.knowledge_enabled,
    remember_conversation: settings.remember_conversation,
    conversation_timeout_minutes: settings.conversation_timeout_minutes,
    max_conversation_age: settings.max_conversation_age,
  };
}

function buildDefaultDraft(t: (key: string) => string): SettingsDraft {
  return {
    is_enabled: true,
    provider: "openai",
    model: "gpt-5.5",
    temperature: 0.3,
    max_tokens: 1000,
    response_language: "system",
    assistant_name: t("aiAssistant.defaults.assistantName"),
    assistant_avatar: "",
    language: "en",
    personality: t("aiAssistant.defaults.personality"),
    tone: "friendly",
    welcome_message: t("aiAssistant.defaults.welcomeMessage"),
    fallback_message: t("aiAssistant.defaults.fallbackMessage"),
    working_hours_enabled: false,
    allow_auto_booking: true,
    allow_reschedule: true,
    allow_cancellation: true,
    handoff_to_human: true,
    knowledge_enabled: false,
    remember_conversation: true,
    conversation_timeout_minutes: 30,
    max_conversation_age: 1440,
  };
}

function draftToUpdate(draft: SettingsDraft): AiAssistantSettingsUpdate {
  return {
    is_enabled: draft.is_enabled,
    provider: draft.provider,
    model: draft.model.trim(),
    temperature: draft.temperature,
    max_tokens: draft.max_tokens,
    response_language: draft.response_language,
    assistant_name: draft.assistant_name.trim().slice(0, 100),
    assistant_avatar: draft.assistant_avatar.trim() || null,
    language: draft.language,
    personality: draft.personality.trim(),
    tone: draft.tone,
    welcome_message: draft.welcome_message.trim().slice(0, 1000),
    fallback_message: draft.fallback_message.trim().slice(0, 1000),
    working_hours_enabled: draft.working_hours_enabled,
    allow_auto_booking: draft.allow_auto_booking,
    allow_reschedule: draft.allow_reschedule,
    allow_cancellation: draft.allow_cancellation,
    handoff_to_human: draft.handoff_to_human,
    knowledge_enabled: draft.knowledge_enabled,
    remember_conversation: draft.remember_conversation,
    conversation_timeout_minutes: draft.conversation_timeout_minutes,
    max_conversation_age: draft.remember_conversation ? draft.max_conversation_age : 0,
  };
}

function SettingRow({
  label,
  description,
  children,
  disabled,
}: {
  label: string;
  description?: string;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <div
      className={`flex flex-col gap-3 rounded-xl border border-white/10 bg-black/20 p-4 sm:flex-row sm:items-center sm:justify-between ${
        disabled ? "opacity-60" : ""
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{label}</p>
        {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function AiAssistantPage() {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const { company } = useAuth();
  const { isSuperAdmin, hasPermission } = useAuthUser();
  const [, setLocation] = useLocation();

  const companyId = company?.id ?? null;
  const { data: settings, isLoading, error } = useAiAssistantSettings(companyId);
  const createSettings = useCreateAiAssistantSettings();
  const updateSettings = useUpdateAiAssistantSettings();

  const canView = isSuperAdmin || hasPermission("ai_assistant.view");
  const canEdit = isSuperAdmin || hasPermission("ai_assistant.edit");
  const { resolvedEnabled: knowledgeFeatureEnabled } = useKnowledgeFeatureEnabled();
  const { resolvedEnabled: analyticsFeatureEnabled } = useAnalyticsFeatureEnabled();
  const { resolvedEnabled: workflowFeatureEnabled } = useWorkflowFeatureEnabled();
  const showKnowledgeTab = shouldShowKnowledgeAssistantTab({
    isSuperAdmin,
    knowledgeFeatureEnabled,
  });
  const showAnalyticsIntegration = shouldShowAnalyticsIntegration({
    isSuperAdmin,
    hasPermission,
    analyticsFeatureEnabled,
  });
  const showAutomationIntegration = isAutomationRouteAccessible({
    isSuperAdmin,
    hasPermission,
    workflowFeatureEnabled,
  });

  const [draft, setDraft] = useState<SettingsDraft>(() => buildDefaultDraft(t));
  const [activeTab, setActiveTab] = useState("general");
  const [initialized, setInitialized] = useState(false);
  const createAttemptedRef = useRef(false);

  useEffect(() => {
    if (!showKnowledgeTab && activeTab === "knowledge") {
      setActiveTab("general");
    }
  }, [activeTab, showKnowledgeTab]);

  const isBusy = createSettings.isPending || updateSettings.isPending;

  useEffect(() => {
    if (!companyId || isLoading || settings || !canEdit || createAttemptedRef.current) {
      return;
    }

    if (!error && settings === null) {
      createAttemptedRef.current = true;
      const defaults = buildDefaultDraft(t);
      createSettings.mutate(
        {
          company_id: companyId,
          is_enabled: defaults.is_enabled,
          provider: defaults.provider,
          model: defaults.model,
          temperature: defaults.temperature,
          max_tokens: defaults.max_tokens,
          response_language: defaults.response_language,
          assistant_name: defaults.assistant_name,
          assistant_avatar: null,
          language: defaults.language,
          personality: defaults.personality,
          tone: defaults.tone,
          welcome_message: defaults.welcome_message,
          fallback_message: defaults.fallback_message,
          working_hours_enabled: defaults.working_hours_enabled,
          allow_auto_booking: defaults.allow_auto_booking,
          allow_reschedule: defaults.allow_reschedule,
          allow_cancellation: defaults.allow_cancellation,
          handoff_to_human: defaults.handoff_to_human,
          knowledge_enabled: defaults.knowledge_enabled,
          remember_conversation: defaults.remember_conversation,
          conversation_timeout_minutes: defaults.conversation_timeout_minutes,
          max_conversation_age: defaults.max_conversation_age,
        },
        {
          onError: (mutationError) => {
            createAttemptedRef.current = false;
            toast({
              title: t("aiAssistant.errors.loadFailed"),
              description: mutationError.message,
              variant: "destructive",
            });
          },
        },
      );
    }
  }, [companyId, isLoading, settings, canEdit, error, createSettings, t, toast]);

  useEffect(() => {
    if (settings && !initialized) {
      setDraft(settingsToDraft(settings));
      setInitialized(true);
    }
  }, [settings, initialized]);

  const toneOptions = useMemo(
    () =>
      [
        { value: "friendly" as const, label: t("aiAssistant.general.tones.friendly") },
        { value: "professional" as const, label: t("aiAssistant.general.tones.professional") },
        { value: "formal" as const, label: t("aiAssistant.general.tones.formal") },
      ],
    [t],
  );

  const providerOptions = useMemo(
    () =>
      [
        { value: "openai" as const, label: t("aiAssistant.general.providers.openai") },
        { value: "anthropic" as const, label: t("aiAssistant.general.providers.anthropic") },
        { value: "google" as const, label: t("aiAssistant.general.providers.google") },
        { value: "azure" as const, label: t("aiAssistant.general.providers.azure") },
      ],
    [t],
  );

  const responseLanguageOptions = useMemo(
    () =>
      [
        { value: "system" as const, label: t("aiAssistant.general.responseLanguages.system") },
        { value: "en" as const, label: t("languages.english") },
        { value: "ar" as const, label: t("languages.arabic") },
      ],
    [t],
  );

  const handleSave = () => {
    if (!companyId || !settings || !canEdit) return;

    updateSettings.mutate(
      {
        id: settings.id,
        companyId,
        values: draftToUpdate(draft),
      },
      {
        onSuccess: () => {
          toast({
            title: t("aiAssistant.save.successTitle"),
            description: t("aiAssistant.save.successDescription"),
          });
        },
        onError: (mutationError) => {
          toast({
            title: t("aiAssistant.save.errorTitle"),
            description: mutationError.message,
            variant: "destructive",
          });
        },
      },
    );
  };

  if (!canView) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{t("aiAssistant.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("aiAssistant.noPermission")}</p>
        </div>
      </div>
    );
  }

  if (!companyId) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{t("aiAssistant.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("aiAssistant.noCompany")}</p>
        </div>
      </div>
    );
  }

  if (isLoading || createSettings.isPending || (!settings && canEdit && !error)) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!settings && !canEdit) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{t("aiAssistant.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("aiAssistant.notConfigured")}</p>
        </div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{t("aiAssistant.title")}</h1>
          <p className="mt-1 text-sm text-destructive">{error.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/30 bg-primary/10">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">{t("aiAssistant.title")}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{t("aiAssistant.subtitle")}</p>
            </div>
          </div>
        </div>
        {canEdit ? (
          <Button
            onClick={handleSave}
            disabled={isBusy}
            className="gap-2 bg-primary/20 text-primary hover:bg-primary/30 border border-primary/30 w-full sm:w-auto"
          >
            {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {t("aiAssistant.save.button")}
          </Button>
        ) : (
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-muted-foreground">
            <Shield className="h-3.5 w-3.5" />
            {t("aiAssistant.readOnly")}
          </span>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-black/30 p-1">
          <TabsTrigger value="general" className="gap-2 data-[state=active]:bg-primary/15 data-[state=active]:text-primary">
            <Bot className="h-4 w-4" />
            <span className="hidden sm:inline">{t("aiAssistant.sections.general")}</span>
            <span className="sm:hidden">{t("aiAssistant.sections.generalShort")}</span>
          </TabsTrigger>
          <TabsTrigger value="conversation" className="gap-2 data-[state=active]:bg-primary/15 data-[state=active]:text-primary">
            <MessageSquare className="h-4 w-4" />
            <span className="hidden sm:inline">{t("aiAssistant.sections.conversation")}</span>
            <span className="sm:hidden">{t("aiAssistant.sections.conversationShort")}</span>
          </TabsTrigger>
          <TabsTrigger value="business" className="gap-2 data-[state=active]:bg-primary/15 data-[state=active]:text-primary">
            <Shield className="h-4 w-4" />
            <span className="hidden sm:inline">{t("aiAssistant.sections.businessRules")}</span>
            <span className="hidden md:inline sm:hidden">{t("aiAssistant.sections.businessRulesShort")}</span>
            <span className="md:hidden">{t("aiAssistant.sections.businessShort")}</span>
          </TabsTrigger>
          {showKnowledgeTab ? (
            <TabsTrigger value="knowledge" className="gap-2 data-[state=active]:bg-primary/15 data-[state=active]:text-primary">
              <BookOpen className="h-4 w-4" />
              <span className="hidden sm:inline">{t("aiAssistant.sections.knowledge")}</span>
              <span className="sm:hidden">{t("aiAssistant.sections.knowledgeShort")}</span>
            </TabsTrigger>
          ) : null}
          <TabsTrigger value="integrations" className="gap-2 data-[state=active]:bg-primary/15 data-[state=active]:text-primary">
            <Plug className="h-4 w-4" />
            <span className="hidden sm:inline">{t("aiAssistant.sections.integrations")}</span>
            <span className="sm:hidden">{t("aiAssistant.sections.integrationsShort")}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-4">
          <PlatformManagedProviderStatus companyId={companyId} />
          <Card>
            <h2 className="mb-4 text-sm font-semibold">{t("aiAssistant.sections.general")}</h2>
            <div className="mb-4">
              <SettingRow
                label={t("aiAssistant.general.enableAi")}
                description={t("aiAssistant.general.enableAiDesc")}
                disabled={!canEdit}
              >
                <Switch
                  checked={draft.is_enabled}
                  onCheckedChange={(checked) =>
                    setDraft((current) => ({ ...current, is_enabled: checked }))
                  }
                  disabled={!canEdit}
                />
              </SettingRow>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="assistant-name">{t("aiAssistant.general.assistantName")}</Label>
                <Input
                  id="assistant-name"
                  value={draft.assistant_name}
                  onChange={(event) => setDraft((current) => ({ ...current, assistant_name: event.target.value }))}
                  disabled={!canEdit}
                  maxLength={100}
                  className="border-white/10 bg-black/20"
                  placeholder={t("aiAssistant.general.assistantNamePlaceholder")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="assistant-avatar">{t("aiAssistant.general.assistantAvatar")}</Label>
                <Input
                  id="assistant-avatar"
                  value={draft.assistant_avatar}
                  onChange={(event) => setDraft((current) => ({ ...current, assistant_avatar: event.target.value }))}
                  disabled={!canEdit}
                  className="border-white/10 bg-black/20"
                  placeholder={t("aiAssistant.general.assistantAvatarPlaceholder")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="assistant-language">{t("aiAssistant.general.defaultLanguage")}</Label>
                <select
                  id="assistant-language"
                  value={draft.language}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      language: event.target.value as AiAssistantLanguage,
                    }))
                  }
                  disabled={!canEdit}
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm outline-none focus:border-primary/40"
                >
                  <option value="en">{t("languages.english")}</option>
                  <option value="ar">{t("languages.arabic")}</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="assistant-tone">{t("aiAssistant.general.replyTone")}</Label>
                <select
                  id="assistant-tone"
                  value={draft.tone}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      tone: event.target.value as AiAssistantTone,
                    }))
                  }
                  disabled={!canEdit}
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm outline-none focus:border-primary/40"
                >
                  {toneOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="assistant-provider">{t("aiAssistant.general.provider")}</Label>
                <select
                  id="assistant-provider"
                  value={draft.provider}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      provider: event.target.value as AiAssistantProvider,
                    }))
                  }
                  disabled={!canEdit}
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm outline-none focus:border-primary/40"
                >
                  {providerOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="assistant-model">{t("aiAssistant.general.model")}</Label>
                <Input
                  id="assistant-model"
                  value={draft.model}
                  onChange={(event) => setDraft((current) => ({ ...current, model: event.target.value }))}
                  disabled={!canEdit}
                  className="border-white/10 bg-black/20"
                  placeholder={t("aiAssistant.general.modelPlaceholder")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="assistant-temperature">{t("aiAssistant.general.temperature")}</Label>
                <Input
                  id="assistant-temperature"
                  type="number"
                  min={0}
                  max={2}
                  step={0.1}
                  value={draft.temperature}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      temperature: Math.min(2, Math.max(0, Number(event.target.value) || 0)),
                    }))
                  }
                  disabled={!canEdit}
                  className="border-white/10 bg-black/20"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="assistant-max-tokens">{t("aiAssistant.general.maxTokens")}</Label>
                <Input
                  id="assistant-max-tokens"
                  type="number"
                  min={1}
                  value={draft.max_tokens}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      max_tokens: Math.max(1, Number(event.target.value) || 1),
                    }))
                  }
                  disabled={!canEdit}
                  className="border-white/10 bg-black/20"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="assistant-response-language">{t("aiAssistant.general.responseLanguage")}</Label>
                <select
                  id="assistant-response-language"
                  value={draft.response_language}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      response_language: event.target.value as AiAssistantResponseLanguage,
                    }))
                  }
                  disabled={!canEdit}
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm outline-none focus:border-primary/40"
                >
                  {responseLanguageOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="welcome-message">{t("aiAssistant.general.welcomeMessage")}</Label>
                <Textarea
                  id="welcome-message"
                  value={draft.welcome_message}
                  onChange={(event) => setDraft((current) => ({ ...current, welcome_message: event.target.value }))}
                  disabled={!canEdit}
                  maxLength={1000}
                  className="min-h-[100px] border-white/10 bg-black/20"
                  placeholder={t("aiAssistant.general.welcomeMessagePlaceholder")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fallback-message">{t("aiAssistant.general.fallbackMessage")}</Label>
                <Textarea
                  id="fallback-message"
                  value={draft.fallback_message}
                  onChange={(event) => setDraft((current) => ({ ...current, fallback_message: event.target.value }))}
                  disabled={!canEdit}
                  maxLength={1000}
                  className="min-h-[100px] border-white/10 bg-black/20"
                  placeholder={t("aiAssistant.general.fallbackMessagePlaceholder")}
                />
              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="conversation" className="space-y-4">
          <Card>
            <h2 className="mb-4 text-sm font-semibold">{t("aiAssistant.sections.conversation")}</h2>
            <div className="space-y-3">
              <SettingRow
                label={t("aiAssistant.conversation.rememberConversation")}
                description={t("aiAssistant.conversation.rememberConversationDesc")}
                disabled={!canEdit}
              >
                <Switch
                  checked={draft.remember_conversation}
                  onCheckedChange={(checked) =>
                    setDraft((current) => ({ ...current, remember_conversation: checked }))
                  }
                  disabled={!canEdit}
                />
              </SettingRow>
              <SettingRow
                label={t("aiAssistant.conversation.timeout")}
                description={t("aiAssistant.conversation.timeoutDesc")}
                disabled={!canEdit}
              >
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    value={draft.conversation_timeout_minutes}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        conversation_timeout_minutes: Math.max(0, Number(event.target.value) || 0),
                      }))
                    }
                    disabled={!canEdit}
                    className="w-24 border-white/10 bg-black/20"
                  />
                  <span className="text-xs text-muted-foreground">{t("aiAssistant.conversation.minutes")}</span>
                </div>
              </SettingRow>
              <SettingRow
                label={t("aiAssistant.conversation.maxDuration")}
                description={t("aiAssistant.conversation.maxDurationDesc")}
                disabled={!canEdit || !draft.remember_conversation}
              >
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    value={draft.max_conversation_age}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        max_conversation_age: Math.max(0, Number(event.target.value) || 0),
                      }))
                    }
                    disabled={!canEdit || !draft.remember_conversation}
                    className="w-24 border-white/10 bg-black/20"
                  />
                  <span className="text-xs text-muted-foreground">{t("aiAssistant.conversation.minutes")}</span>
                </div>
              </SettingRow>
            </div>
            <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
              <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {t("aiAssistant.conversation.note")}
            </p>
          </Card>
        </TabsContent>

        <TabsContent value="business" className="space-y-4">
          <Card>
            <h2 className="mb-4 text-sm font-semibold">{t("aiAssistant.sections.businessRules")}</h2>
            <div className="space-y-3">
              {[
                {
                  key: "allow_auto_booking" as const,
                  label: t("aiAssistant.businessRules.allowAutoBooking"),
                  description: t("aiAssistant.businessRules.allowAutoBookingDesc"),
                },
                {
                  key: "allow_cancellation" as const,
                  label: t("aiAssistant.businessRules.allowCancellation"),
                  description: t("aiAssistant.businessRules.allowCancellationDesc"),
                },
                {
                  key: "allow_reschedule" as const,
                  label: t("aiAssistant.businessRules.allowRescheduling"),
                  description: t("aiAssistant.businessRules.allowReschedulingDesc"),
                },
                {
                  key: "handoff_to_human" as const,
                  label: t("aiAssistant.businessRules.handoffToHuman"),
                  description: t("aiAssistant.businessRules.handoffToHumanDesc"),
                },
                {
                  key: "working_hours_enabled" as const,
                  label: t("aiAssistant.businessRules.workingHoursOnly"),
                  description: t("aiAssistant.businessRules.workingHoursOnlyDesc"),
                },
              ].map((item) => (
                <SettingRow
                  key={item.key}
                  label={item.label}
                  description={item.description}
                  disabled={!canEdit}
                >
                  <Switch
                    checked={draft[item.key]}
                    onCheckedChange={(checked) =>
                      setDraft((current) => ({ ...current, [item.key]: checked }))
                    }
                    disabled={!canEdit}
                  />
                </SettingRow>
              ))}
            </div>
          </Card>
        </TabsContent>

        {showKnowledgeTab ? (
        <TabsContent value="knowledge" className="space-y-4">
          <Card>
            <h2 className="mb-4 text-sm font-semibold">{t("aiAssistant.sections.knowledge")}</h2>
            <SettingRow
              label={t("aiAssistant.knowledge.enable")}
              description={t("aiAssistant.knowledge.enableDesc")}
              disabled={!canEdit || knowledgeFeatureEnabled === false}
            >
              <Switch
                checked={draft.knowledge_enabled}
                onCheckedChange={(checked) =>
                  setDraft((current) => ({ ...current, knowledge_enabled: checked }))
                }
                disabled={!canEdit || knowledgeFeatureEnabled === false}
              />
            </SettingRow>
            <div className="mt-4 rounded-xl border border-dashed border-primary/20 bg-primary/5 p-4">
              <p className="text-sm text-muted-foreground">{t("aiAssistant.knowledge.futureNote")}</p>
            </div>
          </Card>
        </TabsContent>
        ) : null}

        <TabsContent value="integrations" className="space-y-4">
          <Card>
            <h2 className="mb-4 text-sm font-semibold">{t("aiAssistant.sections.integrations")}</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {[
                {
                  title: t("aiAssistant.integrations.whatsapp.title"),
                  description: t("aiAssistant.integrations.whatsapp.description"),
                  action: t("aiAssistant.integrations.openLink"),
                  onClick: () => setLocation(getDashboardRouteById("channels").nestedPath),
                  available: hasPermission("channels.view") || isSuperAdmin,
                },
                {
                  title: t("aiAssistant.integrations.omnichannel.title"),
                  description: t("aiAssistant.integrations.omnichannel.description"),
                  action: t("aiAssistant.integrations.openLink"),
                  onClick: () => setLocation(getDashboardRouteById("omnichannel").nestedPath),
                  available: hasPermission("ai.conversations.view") || isSuperAdmin,
                },
                {
                  title: t("aiAssistant.integrations.openai.title"),
                  description: t("aiAssistant.integrations.openai.description"),
                  action: t("aiAssistant.integrations.configure"),
                  onClick: () => {
                    setActiveTab("general");
                    window.location.hash = "provider-setup";
                  },
                  available: true,
                },
                {
                  title: t("aiAssistant.integrations.knowledge.title"),
                  description: t("aiAssistant.integrations.knowledge.description"),
                  action: t("aiAssistant.integrations.openLink"),
                  onClick: () => setLocation(getDashboardRouteById("knowledge").nestedPath),
                  available: (hasPermission("knowledge.view") || isSuperAdmin) && showKnowledgeTab,
                },
                {
                  title: t("aiAssistant.integrations.analytics.title"),
                  description: t("aiAssistant.integrations.analytics.description"),
                  action: t("aiAssistant.integrations.openLink"),
                  onClick: () => setLocation(getDashboardRouteById("ai-analytics").nestedPath),
                  available: showAnalyticsIntegration,
                },
                {
                  title: t("aiAssistant.integrations.automation.title"),
                  description: t("aiAssistant.integrations.automation.description"),
                  action: t("aiAssistant.integrations.openLink"),
                  onClick: () => setLocation(getDashboardRouteById("automation").nestedPath),
                  available: showAutomationIntegration,
                },
                {
                  title: t("aiAssistant.integrations.receptionist.title"),
                  description: t("aiAssistant.integrations.receptionist.description"),
                  action: null,
                  onClick: null,
                  available: false,
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className={`rounded-xl border border-white/10 bg-black/20 p-4 ${
                    item.available ? "" : "opacity-70"
                  }`}
                >
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
                  {item.available && item.action && item.onClick ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="mt-3 gap-2 border-white/10"
                      onClick={item.onClick}
                    >
                      {item.action}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  ) : (
                    <span className="mt-3 inline-flex rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[10px] font-mono uppercase tracking-wide text-amber-400">
                      {t("aiAssistant.integrations.comingSoon")}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default AiAssistantPage;
