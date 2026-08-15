import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Plug, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Can } from "@/components/rbac/permission-guard";
import { useToast } from "@/hooks/use-toast";
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

/** Creates a company provider connection that uses the platform encrypted API key. */
export function AiProviderSetupPanel({
  companyId,
  assistantProvider,
  assistantModel,
  assistantName,
  canEdit,
}: AiProviderSetupPanelProps) {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const registryKey = assistantProviderToRegistryKey(assistantProvider);

  const { data: connections = [], isLoading } = useAiProviderConnectionsAdmin(companyId);
  const { data: providerTypes = [] } = useAiProviderTypes();
  const { create, setDefault } = useAiProviderConnectionMutations(companyId);

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

    try {
      await create.mutateAsync({
        providerId: providerDefinition.id,
        displayName: t("aiAssistant.providerSetup.defaultConnectionName", {
          assistant: assistantName,
          provider: providerDefinition.display_name,
        }),
        configuration: {
          model: assistantModel.trim() || providerDefinition.default_configuration.model,
        },
        isDefault: true,
        isEnabled: true,
        status: "active",
        healthStatus: "unknown",
      });

      toast({
        title: t("aiAssistant.providerSetup.saveSuccess"),
        description: t("aiAssistant.providerSetup.saveSuccessDetail"),
      });
    } catch (error) {
      toast({
        title: t("aiAssistant.providerSetup.saveError"),
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    }
  };

  const handleSetDefault = async () => {
    if (!effectiveSelectedId) return;
    try {
      await setDefault.mutateAsync(effectiveSelectedId);
      toast({
        title: t("aiAssistant.providerSetup.saveSuccess"),
        description: t("aiAssistant.providerSetup.setDefaultSuccess"),
      });
    } catch (error) {
      toast({
        title: t("aiAssistant.providerSetup.saveError"),
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    }
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

      {hasMismatch ? (
        <p className="text-xs text-amber-400/90">{t("aiAssistant.providerSetup.providerMismatch")}</p>
      ) : null}

      {isLoading ? (
        <p className="text-xs text-muted-foreground">{t("aiAssistant.providerSetup.loading")}</p>
      ) : (
        <>
          {matchingConnections.length > 0 ? (
            <div className="space-y-3">
              <Label htmlFor="provider-connection-select">{t("aiAssistant.providerSetup.selectConnection")}</Label>
              <select
                id="provider-connection-select"
                className="flex h-10 w-full rounded-md border border-white/10 bg-black/20 px-3 text-sm"
                value={effectiveSelectedId}
                disabled={!canEdit || setDefault.isPending}
                onChange={(event) => setSelectedConnectionId(event.target.value)}
              >
                {matchingConnections.map((connection) => (
                  <option key={connection.id} value={connection.id}>
                    {connection.display_name}
                    {connection.is_default ? ` (${t("aiAssistant.providerSetup.defaultBadge")})` : ""}
                  </option>
                ))}
              </select>
              {canEdit && effectiveSelectedId && effectiveSelectedId !== activeDefault?.id ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={setDefault.isPending}
                  onClick={() => void handleSetDefault()}
                >
                  {t("aiAssistant.providerSetup.setDefault")}
                </Button>
              ) : null}
            </div>
          ) : null}

          <Can permission="ai.providers.manage">
            <div className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-4">
              <p className="text-sm font-medium flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                {matchingConnections.length > 0
                  ? t("aiAssistant.providerSetup.createAnother")
                  : t("aiAssistant.providerSetup.createFirst")}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {t("aiAssistant.providerSetup.targetProvider", {
                  provider: providerDefinition?.display_name ?? registryKey,
                })}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {t("aiAssistant.providerSetup.platformKeyHint")}
              </p>
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
