import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Switch } from "@/components/ui/switch";
import { getAiCapabilityById } from "@/lib/platform-ai/ai-capability-catalog";
import {
  AI_CAPABILITY_STATE_LABEL_KEYS,
  type ResolvedAiCapability,
} from "@/lib/platform-ai/ai-capability-catalog-schema";
import { cn } from "@/lib/utils";

type CompanyAiFeatureCardProps = {
  feature: ResolvedAiCapability;
  onToggle?: (enabled: boolean) => void;
  toggling?: boolean;
};

const STATE_BADGE_CLASSES: Record<ResolvedAiCapability["state"], string> = {
  enabled: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  disabled: "border-white/10 bg-background/40 text-muted-foreground",
  locked: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  coming_soon: "border-white/10 bg-background/40 text-muted-foreground",
  beta: "border-violet-500/30 bg-violet-500/10 text-violet-400",
};

export function CompanyAiFeatureCard({ feature, onToggle, toggling = false }: CompanyAiFeatureCardProps) {
  const { t } = useTranslation("common");
  const Icon = feature.icon;

  const reasonText = useMemo(() => {
    if (!feature.stateReasonKey) return null;

    if (feature.stateReasonKey === "platformAi.admin.capabilityReasons.requiresDependencies") {
      const labels = feature.dependencyResolution.missingDependencyIds
        .map((dependencyId) => {
          const dependency = getAiCapabilityById(dependencyId);
          return dependency ? t(dependency.displayNameKey) : dependencyId;
        })
        .join(", ");
      return t(feature.stateReasonKey, { dependencies: labels });
    }

    return t(feature.stateReasonKey, feature.stateReasonParams ?? {});
  }, [feature, t]);

  const switchChecked = feature.state === "enabled";

  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-3 transition-colors",
        feature.state === "locked" || feature.state === "coming_soon"
          ? "border-white/5 bg-background/20"
          : "border-white/10 bg-background/30",
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/5">
            <Icon className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-sm font-medium">{t(feature.displayNameKey)}</h4>
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                  STATE_BADGE_CLASSES[feature.state],
                )}
              >
                {t(AI_CAPABILITY_STATE_LABEL_KEYS[feature.state])}
              </span>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">{t(feature.descriptionKey)}</p>
            {reasonText ? (
              <p className="text-xs leading-relaxed text-amber-400/90">{reasonText}</p>
            ) : null}
          </div>
        </div>
        <Switch
          checked={switchChecked}
          disabled={feature.toggleDisabled || toggling}
          onCheckedChange={(checked) => onToggle?.(checked)}
          aria-label={t(feature.displayNameKey)}
        />
      </div>
    </div>
  );
}
