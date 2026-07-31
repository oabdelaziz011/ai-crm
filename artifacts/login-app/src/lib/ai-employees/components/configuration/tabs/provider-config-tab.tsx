import { useTranslation } from "react-i18next";
import {
  AgentConfigTabProps,
  ConfigSection,
  ReadonlyGrid,
  ValidationList,
} from "@/lib/ai-employees/components/configuration/config-tab-shared";

export function ProviderConfigTab({ preview }: AgentConfigTabProps) {
  const { t } = useTranslation("common");
  const provider = preview?.provider;

  return (
    <div className="space-y-6">
      <ConfigSection title={t("aiEmployees.config.sections.provider")}>
        <ReadonlyGrid
          rows={[
            { label: t("aiEmployees.form.provider"), value: provider?.providerKey },
            { label: t("aiEmployees.config.fields.connection"), value: provider?.connectionName },
            { label: t("aiEmployees.config.fields.apiStatus"), value: provider?.apiStatus },
            {
              label: t("aiEmployees.config.fields.capabilities"),
              value: provider?.capabilities.length ? provider.capabilities.join(", ") : "—",
            },
            { label: t("aiEmployees.config.fields.contextWindow"), value: provider?.contextWindow },
            {
              label: t("aiEmployees.config.fields.availableModels"),
              value: provider?.availableModels.length ? provider.availableModels.join(", ") : "—",
            },
          ]}
        />
      </ConfigSection>
      <ValidationList preview={preview} />
    </div>
  );
}
