import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { LEGACY_AI_FEATURE_KEY_MAP } from "@workspace/configuration-platform";
import { PLATFORM_AI_FEATURE_KEY } from "@workspace/platform-ai-provider";
import { RefreshCw, Shield } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import {
  PlatformAiConnectionLed,
  type PlatformAiConnectionState,
} from "@/components/platform-ai";
import { Button } from "@/components/ui/button";
import { getDashboardRouteById } from "@/config/dashboard-route-registry";
import { useAuth } from "@/context/auth-context";
import { useAiChatFeatureEnabled } from "@/hooks/platform-ai/use-platform-ai-feature-enabled";
import { usePlatformAIProviderServices } from "@/hooks/use-platform-ai-provider";
import { useAuthUser } from "@/hooks/use-rbac";
import { useToast } from "@/hooks/use-toast";
import { useAiProviderConnectionsAdmin } from "@/hooks/use-ai-provider-connections-admin";
import { featureFlagQueryKey } from "@/hooks/use-feature-flag";
import {
  buildApplicationContext,
  createLoginAppApplicationLayerRegistry,
  permissionCodes,
} from "@/lib/application-layer/application-layer-bootstrap";
import { pickDefaultConnection } from "@/lib/runtime-integration/chat-config";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

const AI_CHAT_UNIFIED_KEY =
  LEGACY_AI_FEATURE_KEY_MAP[PLATFORM_AI_FEATURE_KEY.AI_CHAT] ?? "ai.chat";

type PlatformManagedProviderStatusProps = {
  companyId: string | null;
};

/**
 * Shows platform-key management context + real readiness for AI Chat:
 * company provider connection AND company AI chat feature flag.
 */
export function PlatformManagedProviderStatus({ companyId }: PlatformManagedProviderStatusProps) {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { isSuperAdmin, hasPermission } = useAuthUser();
  const { services, context } = usePlatformAIProviderServices();
  const [enablingFeature, setEnablingFeature] = useState(false);
  const canEnableFeatureFlag = isSuperAdmin || hasPermission("feature_flags.write");

  const {
    data: connections = [],
    isLoading: connectionsLoading,
    isFetching: connectionsFetching,
    refetch: refetchConnections,
  } = useAiProviderConnectionsAdmin(companyId);

  const {
    isLoading: featureLoading,
    isEnabled: featureEnabled,
    resolvedEnabled,
    licenseBlocked,
    licenseReason,
  } = useAiChatFeatureEnabled();

  const activeConnection = useMemo(
    () => pickDefaultConnection(connections.filter((connection) => connection.is_enabled)),
    [connections],
  );

  const providerBound = Boolean(activeConnection?.id);
  const featureReady = resolvedEnabled !== false && featureEnabled;
  const checking = connectionsLoading || featureLoading;

  const connectionState: PlatformAiConnectionState = useMemo(() => {
    if (checking) return "checking";
    return providerBound && featureReady ? "connected" : "disconnected";
  }, [checking, featureReady, providerBound]);

  const statusDetail = useMemo(() => {
    if (checking) return t("platformAi.tenant.checkingDetail");
    if (providerBound && featureReady) return t("platformAi.tenant.statusReady");
    if (licenseBlocked) {
      return t("platformAi.tenant.statusLicenseBlocked", {
        reason: licenseReason ?? t("platformAi.tenant.licenseUnknown"),
      });
    }
    if (providerBound && !featureReady) return t("platformAi.tenant.statusFeatureDisabled");
    if (!providerBound && featureReady) return t("platformAi.tenant.statusProviderMissing");
    return t("platformAi.tenant.statusDisconnected");
  }, [checking, featureReady, licenseBlocked, licenseReason, providerBound, t]);

  const invalidateReadiness = async () => {
    await Promise.all([
      refetchConnections(),
      queryClient.invalidateQueries({
        queryKey: featureFlagQueryKey(companyId, AI_CHAT_UNIFIED_KEY),
      }),
      queryClient.invalidateQueries({ queryKey: ["feature-flag", companyId] }),
      queryClient.invalidateQueries({ queryKey: ["license-access", companyId] }),
      queryClient.invalidateQueries({ queryKey: ["runtime-chat-config"] }),
      queryClient.invalidateQueries({ queryKey: ["platform-ai-feature-flags", companyId] }),
    ]);
  };

  const verifyBinding = async () => {
    await invalidateReadiness();
    const ready = providerBound && featureReady;
    toast({
      title: ready
        ? t("platformAi.tenant.verifiedConnected")
        : t("platformAi.tenant.verifiedDisconnected"),
      description: !ready && licenseBlocked ? (licenseReason ?? undefined) : undefined,
      variant: ready ? "default" : "destructive",
    });
  };

  const enableFeature = async () => {
    if (!companyId || !user?.id) return;
    setEnablingFeature(true);
    try {
      const portContext = {
        companyId,
        actorUserId: user.id,
        isSuperAdmin,
        hasPermission,
      };
      const registry = createLoginAppApplicationLayerRegistry(portContext);
      const appContext = buildApplicationContext({
        tenantId: companyId,
        actorId: user.id,
        permissions: permissionCodes(hasPermission, isSuperAdmin),
      });

      // Flip every company-scoped ai.chat row (any environment) then upsert production.
      const { error: updateError } = await supabase
        .from("platform_feature_flags")
        .update({
          enabled: true,
          updated_at: new Date().toISOString(),
          updated_by: user.id,
        })
        .eq("feature_key", AI_CHAT_UNIFIED_KEY)
        .eq("scope_type", "company")
        .eq("scope_id", companyId);
      if (updateError) {
        throw new Error(updateError.message);
      }

      await registry.getServices().featureFlags.upsert(
        {
          featureKey: AI_CHAT_UNIFIED_KEY,
          scopeType: "company",
          scopeId: companyId,
          enabled: true,
          environment: "production",
          rolloutPercentage: 100,
        },
        appContext,
      );

      // Kill-switch only: do not mutate platform_company_licenses for mapped commercial keys.
      // ai.chat → ai_assistant is Phase 6 commercial entitlement. Missing grant ≠ unlock via license add-on.
      const { data: entitled, error: entitleError } = await supabase.rpc("is_feature_enabled", {
        p_company_id: companyId,
        p_feature_code: "ai_assistant",
      });
      if (entitleError) {
        throw new Error(entitleError.message);
      }
      if (!entitled) {
        if (!isSuperAdmin) {
          throw new Error(
            t(
              "platformAi.tenant.statusCommercialBlocked",
              "AI Assistant is not entitled for this company. Assign a package that includes ai_assistant or grant the commercial feature.",
            ),
          );
        }
        const { error: grantError } = await supabase.rpc("set_company_feature_grant", {
          p_company_id: companyId,
          p_feature_code: "ai_assistant",
          p_enabled: true,
          p_source: "manual",
          p_starts_at: new Date().toISOString(),
          p_expires_at: null,
          p_notes: "platform AI readiness enable",
          p_reason: "Super-admin commercial grant while enabling ai.chat kill-switch",
        });
        if (grantError) {
          throw new Error(grantError.message);
        }
      }

      if (isSuperAdmin) {
        try {
          await services.platform.setFeatureFlag(
            context,
            companyId,
            PLATFORM_AI_FEATURE_KEY.AI_CHAT,
            true,
          );
        } catch {
          // Non-fatal: runtime readiness already uses platform_feature_flags.
        }
      }

      await invalidateReadiness();
      toast({ title: t("platformAi.tenant.featureEnabledToast") });
    } catch (error) {
      toast({
        title: t("platformAi.tenant.featureEnableError"),
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setEnablingFeature(false);
    }
  };

  const verifying = connectionsFetching;

  return (
    <div
      className={cn(
        "rounded-2xl border p-5",
        connectionState === "connected"
          ? "border-emerald-500/30 bg-emerald-500/5"
          : connectionState === "disconnected"
            ? "border-rose-500/30 bg-rose-500/5"
            : "border-border/60 bg-card/40",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="rounded-xl bg-primary/10 p-2 text-primary">
            <Shield className="h-5 w-5" />
          </div>
          <div className="min-w-0 space-y-2">
            <h3 className="text-base font-semibold text-foreground">
              {t("platformAi.tenant.title")}
            </h3>
            <p className="text-sm text-muted-foreground">{t("platformAi.tenant.description")}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PlatformAiConnectionLed
            state={connectionState}
            connectedLabel={t("platformAi.tenant.connected")}
            disconnectedLabel={t("platformAi.tenant.disconnected")}
            checkingLabel={t("platformAi.tenant.checking")}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void verifyBinding()}
            disabled={verifying || !companyId}
          >
            <RefreshCw className={verifying ? "me-1.5 size-3.5 animate-spin" : "me-1.5 size-3.5"} />
            {t("platformAi.tenant.verify")}
          </Button>
        </div>
      </div>

      <div className="mt-4 space-y-2 text-sm">
        <p className={connectionState === "connected" ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}>
          {statusDetail}
        </p>
        <ul className="space-y-1 text-xs text-muted-foreground">
          <li>
            {t("platformAi.tenant.providerLine", {
              status: providerBound
                ? t("platformAi.tenant.connected")
                : t("platformAi.tenant.disconnected"),
              name: activeConnection?.display_name ?? "—",
            })}
          </li>
          <li>
            {t("platformAi.tenant.featureLine", {
              status: featureReady
                ? t("platformAi.tenant.featureOn")
                : t("platformAi.tenant.featureOff"),
            })}
          </li>
        </ul>
      </div>

      {!checking && (!providerBound || !featureReady) ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {!providerBound ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                document.getElementById("provider-setup")?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            >
              {t("platformAi.tenant.openProviderSetup")}
            </Button>
          ) : null}
          {!featureReady && canEnableFeatureFlag ? (
            <Button
              type="button"
              size="sm"
              disabled={enablingFeature}
              onClick={() => void enableFeature()}
            >
              {enablingFeature ? (
                <RefreshCw className="me-1.5 size-3.5 animate-spin" />
              ) : null}
              {t("platformAi.tenant.enableFeature")}
            </Button>
          ) : null}
          {!featureReady && !canEnableFeatureFlag ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setLocation(getDashboardRouteById("settings").nestedPath + "/platform-ai")}
            >
              {t("platformAi.tenant.openPlatformSettings")}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
