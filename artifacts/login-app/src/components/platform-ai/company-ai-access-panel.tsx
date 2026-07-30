import { useMemo } from "react";
import { Shield } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { CompanyAiFeatureCard } from "@/components/platform-ai/company-ai-feature-card";
import { CompanyAiSummaryPanel } from "@/components/platform-ai/company-ai-summary-panel";
import { companyStatusLabel } from "@/components/platform-ai/company-status-badge";
import {
  AI_CAPABILITY_CATEGORY_LABEL_KEYS,
  AI_CAPABILITY_CATEGORIES,
} from "@/lib/platform-ai/ai-capability-catalog-schema";
import {
  buildAiCapabilityCatalogSummary,
  groupAiCapabilities,
  resolveAiCapabilities,
  resolveCompanyPlanTier,
} from "@/lib/platform-ai/resolve-ai-capabilities";
import type { Company } from "@/lib/types";
import type { PlatformAIFeatureFlagRecord } from "@workspace/platform-ai-provider";

type CompanyAiAccessPanelProps = {
  companies: Company[];
  selectedCompanyId: string;
  onSelectedCompanyIdChange: (companyId: string) => void;
  featureFlags: PlatformAIFeatureFlagRecord[];
  onToggleFeature: (input: { featureId: string; enabled: boolean }) => void;
  togglingFeatureId?: string | null;
};

export function CompanyAiAccessPanel({
  companies,
  selectedCompanyId,
  onSelectedCompanyIdChange,
  featureFlags,
  onToggleFeature,
  togglingFeatureId = null,
}: CompanyAiAccessPanelProps) {
  const { t } = useTranslation("common");

  const selectedCompany = useMemo(
    () => companies.find((company) => company.id === selectedCompanyId) ?? null,
    [companies, selectedCompanyId],
  );

  const companyOptions = useMemo(
    () =>
      companies.map((company) => ({
        value: company.id,
        label: company.name,
        description: companyStatusLabel(company.status, t),
      })),
    [companies, t],
  );

  const planLabel = selectedCompany?.plan?.name ?? selectedCompany?.subscription_plan ?? null;
  const companyPlanTier = selectedCompany ? resolveCompanyPlanTier(selectedCompany) : null;

  const resolvedCapabilities = useMemo(
    () =>
      resolveAiCapabilities({
        featureFlags,
        companyPlanTier,
        companyPlanLabel: planLabel,
      }),
    [featureFlags, companyPlanTier, planLabel],
  );

  const capabilityGroups = useMemo(
    () => groupAiCapabilities(resolvedCapabilities),
    [resolvedCapabilities],
  );

  const summary = useMemo(
    () => buildAiCapabilityCatalogSummary(resolvedCapabilities, planLabel, featureFlags),
    [resolvedCapabilities, planLabel, featureFlags],
  );

  return (
    <section className="rounded-2xl border border-white/10 bg-card/40 p-5 space-y-5">
      <div className="flex items-center gap-2">
        <Shield className="h-5 w-5 text-primary" />
        <h2 className="font-semibold">{t("platformAi.admin.sections.companyAiAccess")}</h2>
      </div>

      {companies.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("platformAi.admin.noCompanies")}</p>
      ) : (
        <SearchableSelect
          value={selectedCompanyId}
          onValueChange={onSelectedCompanyIdChange}
          options={companyOptions}
          placeholder={t("platformAi.admin.selectCompany")}
          searchPlaceholder={t("platformAi.admin.searchCompanies")}
          emptyLabel={t("platformAi.admin.noMatchingCompanies")}
        />
      )}

      {selectedCompany ? (
        <>
          <CompanyAiSummaryPanel
            companyName={selectedCompany.name}
            companyStatus={selectedCompany.status}
            summary={summary}
          />

          <div className="space-y-6">
            {AI_CAPABILITY_CATEGORIES.map((category) => {
              const capabilities = capabilityGroups[category];
              if (capabilities.length === 0) return null;

              return (
                <div key={category} className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground">
                    {t(AI_CAPABILITY_CATEGORY_LABEL_KEYS[category])}
                  </h3>
                  <div className="grid gap-3 lg:grid-cols-2">
                    {capabilities.map((capability) => (
                      <CompanyAiFeatureCard
                        key={capability.id}
                        feature={capability}
                        toggling={togglingFeatureId === capability.id}
                        onToggle={
                          capability.canToggle
                            ? (enabled) => onToggleFeature({ featureId: capability.id, enabled })
                            : undefined
                        }
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : companies.length > 0 ? (
        <p className="text-sm text-muted-foreground">{t("platformAi.admin.selectCompanyHint")}</p>
      ) : null}
    </section>
  );
}
