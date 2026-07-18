import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, KeyRound, Plug, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Can } from "@/components/rbac/permission-guard";
import { assistantProviderToRegistryKey } from "@/lib/ai-provider/provider-key-map";
import { pickDefaultConnection } from "@/lib/runtime-integration/chat-config";
import type { AiAssistantProvider } from "@/lib/types";
import {
  useAiProviderConnectionMutations,
  useAiProviderConnectionsAdmin,
  useAiProviderTypes,
} from "@/hooks/use-ai-provider-connections-admin";

type AiProviderSetupPanelProps = {
  companyId: string | null;
  assistantProvider: AiAssistantProvider;
  assistantModel: string;
  assistantName: string;
  canEdit: boolean;
};

export function AiProviderSetupPanel({
  companyId,
  assistantProvider,
  assistantModel,
  assistantName,
  canEdit,
}: AiProviderSetupPanelProps) {
  const { t } = useTranslation("common");
  const registryKey = assistantProviderToRegistryKey(assistantProvider);

  const { data: connections = [], isLoading } = useAiProviderConnectionsAdmin(companyId);
  const { data: providerTypes = [] } = useAiProviderTypes();
  const { create, setDefault } = useAiProviderConnectionMutations(companyId);

  const [apiKey, setApiKey] = useState("");
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>("");

  const providerDefinition = providerTypes.find((type) => type.key === registryKey);

  const matchingConnections = useMemo(
    () =>
      connections.filter(
        (connection) =>
          connection.ai_provider_definition?.key === registryKey && connection.is_enabled,
      ),
    [connections, registryKey],
  );

  const activeDefault = useMemo(
    () => pickDefaultConnection(matchingConnections),
    [matchingConnections],
  );

  const anyEnabledDefault = useMemo(
    () => pickDefaultConnection(connections.filter((connection) => connection.is_enabled)),
    [connections],
  );

  const isReady = Boolean(activeDefault?.id);
  const hasMismatch = Boolean(!isReady && anyEnabledDefault?.id);

  const effectiveSelectedId = selectedConnectionId || activeDefault?.id || matchingConnections[0]?.id || "";

  const handleCreateConnection = async () => {
    if (!companyId || !providerDefinition) return;

    await create.mutateAsync({
      providerId: providerDefinition.id,
      displayName: t("aiAssistant.providerSetup.defaultConnectionName", {
        assistant: assistantName,
        provider: providerDefinition.display_name,
      }),
      configuration: {
        model: assistantModel.trim() || providerDefinition.default_configuration.model,
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
      },
      isDefault: true,
      isEnabled: true,
      status: "active",
      healthStatus: "unknown",
    });

    setApiKey("");
  };

  const handleSetDefault = async () => {
    if (!effectiveSelectedId) return;
    await setDefault.mutateAsync(effectiveSelectedId);
  };

  return (
    <div
      id="provider-setup"
      className={`rounded-2xl border p-5 space-y-4 ${
        isReady ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-xl bg-primary/10 border border-primary/20 shrink-0">
          {isReady ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-amber-400" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Plug className="w-4 h-4 text-primary" />
            {t("aiAssistant.providerSetup.title")}
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            {isReady
              ? t("aiAssistant.providerSetup.readyDescription")
              : t("aiAssistant.providerSetup.missingDescription")}
          </p>
        </div>
      </div>

      <ol className="text-xs space-y-1.5 text-muted-foreground list-decimal list-inside">
        <li>{t("aiAssistant.providerSetup.stepPreferences")}</li>
        <li>{t("aiAssistant.providerSetup.stepConnection")}</li>
        <li>{t("aiAssistant.providerSetup.stepDefault")}</li>
      </ol>

      {hasMismatch && (
        <p className="text-xs text-amber-400/90">{t("aiAssistant.providerSetup.providerMismatch")}</p>
      )}

      {isLoading ? (
        <p className="text-xs text-muted-foreground">{t("aiAssistant.providerSetup.loading")}</p>
      ) : (
        <>
          {matchingConnections.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="provider-connection-select">{t("aiAssistant.providerSetup.selectConnection")}</Label>
              <select
                id="provider-connection-select"
                value={effectiveSelectedId}
                onChange={(event) => setSelectedConnectionId(event.target.value)}
                disabled={!canEdit}
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm outline-none focus:border-primary/40"
              >
                {matchingConnections.map((connection) => (
                  <option key={connection.id} value={connection.id}>
                    {connection.display_name}
                    {connection.is_default ? ` (${t("aiAssistant.providerSetup.defaultBadge")})` : ""}
                  </option>
                ))}
              </select>
              <Can permission="ai.providers.manage">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="border-white/10"
                  disabled={!canEdit || !effectiveSelectedId || setDefault.isPending}
                  onClick={() => void handleSetDefault()}
                >
                  {t("aiAssistant.providerSetup.setDefault")}
                </Button>
              </Can>
            </div>
          )}

          <Can permission="ai.providers.manage">
            <div className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs font-medium flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                {matchingConnections.length > 0
                  ? t("aiAssistant.providerSetup.createAnother")
                  : t("aiAssistant.providerSetup.createFirst")}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {t("aiAssistant.providerSetup.targetProvider", {
                  provider: providerDefinition?.display_name ?? registryKey,
                })}
              </p>
              <div className="space-y-2">
                <Label htmlFor="provider-api-key" className="flex items-center gap-2">
                  <KeyRound className="w-3.5 h-3.5" />
                  {t("aiAssistant.providerSetup.apiKey")}
                </Label>
                <Input
                  id="provider-api-key"
                  type="password"
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  disabled={!canEdit || create.isPending}
                  placeholder={t("aiAssistant.providerSetup.apiKeyPlaceholder")}
                  className="border-white/10 bg-black/20"
                />
                <p className="text-[10px] text-muted-foreground">{t("aiAssistant.providerSetup.apiKeyHint")}</p>
              </div>
              <Button
                type="button"
                size="sm"
                disabled={!canEdit || !providerDefinition || create.isPending}
                onClick={() => void handleCreateConnection()}
                className="gap-2"
              >
                {t("aiAssistant.providerSetup.connectProvider")}
              </Button>
            </div>
          </Can>

          {!canEdit && (
            <p className="text-xs text-muted-foreground">{t("aiAssistant.providerSetup.readOnlyHint")}</p>
          )}
        </>
      )}
    </div>
  );
}
