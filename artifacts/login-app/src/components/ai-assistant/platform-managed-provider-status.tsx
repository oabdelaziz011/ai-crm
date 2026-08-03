import { PLATFORM_AI_FEATURE_KEY } from "@workspace/platform-ai-provider";
import { CheckCircle2, Shield } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFeatureFlag } from "@/hooks/use-feature-flag";
import { LEGACY_AI_FEATURE_KEY_MAP } from "@workspace/configuration-platform";

type PlatformManagedProviderStatusProps = {
  companyId: string | null;
};

export function PlatformManagedProviderStatus({ companyId }: PlatformManagedProviderStatusProps) {
  const { t } = useTranslation("common");
  const { isEnabled: enabled, isLoading } = useFeatureFlag(
    LEGACY_AI_FEATURE_KEY_MAP[PLATFORM_AI_FEATURE_KEY.AI_CHAT] ?? PLATFORM_AI_FEATURE_KEY.AI_CHAT,
  );

  void companyId;

  return (
    <div id="provider-setup" className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-emerald-500/10 p-2 text-emerald-400">
          <Shield className="h-5 w-5" />
        </div>
        <div className="space-y-2">
          <h3 className="text-base font-semibold text-foreground">
            {t("platformAi.tenant.title")}
          </h3>
          <p className="text-sm text-muted-foreground">{t("platformAi.tenant.description")}</p>
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            <span>
              {isLoading
                ? t("common.loading")
                : enabled
                  ? t("platformAi.tenant.statusReady")
                  : t("platformAi.tenant.statusDisabled")}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
