import { useTranslation } from "react-i18next";
import {
  AgentConfigTabProps,
  ConfigSection,
  ReadonlyGrid,
  ValidationList,
} from "@/lib/ai-employees/components/configuration/config-tab-shared";

export function KnowledgeConfigTab({ preview }: AgentConfigTabProps) {
  const { t } = useTranslation("common");
  const knowledge = preview?.knowledge;

  return (
    <div className="space-y-6">
      <ConfigSection title={t("aiEmployees.config.sections.knowledge")}>
        <ReadonlyGrid
          rows={[
            { label: t("aiEmployees.config.fields.enabled"), value: knowledge?.enabled ?? false },
            { label: t("aiEmployees.config.fields.collection"), value: knowledge?.collectionLabel },
            { label: t("aiEmployees.config.fields.documentsSummary"), value: knowledge?.documentsSummary },
            { label: t("aiEmployees.config.fields.topK"), value: knowledge?.retrievalPolicy.topK },
            { label: t("aiEmployees.config.fields.minScore"), value: knowledge?.retrievalPolicy.minScore },
            { label: t("aiEmployees.config.fields.priority"), value: knowledge?.retrievalPolicy.priority },
          ]}
        />
      </ConfigSection>
      {knowledge && knowledge.sources.length > 0 ? (
        <ConfigSection title={t("aiEmployees.config.sections.sources")}>
          <ReadonlyGrid
            rows={knowledge.sources.map((source) => ({
              label: source.name,
              value: `${source.sourceType ?? "unknown"} · ${source.documentCount} docs`,
            }))}
          />
        </ConfigSection>
      ) : null}
      <ValidationList preview={preview} />
    </div>
  );
}
