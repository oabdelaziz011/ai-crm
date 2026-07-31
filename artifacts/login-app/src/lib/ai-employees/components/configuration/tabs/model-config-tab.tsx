import { useTranslation } from "react-i18next";
import {
  AgentConfigTabProps,
  ConfigSection,
  ReadonlyGrid,
  ValidationList,
} from "@/lib/ai-employees/components/configuration/config-tab-shared";

export function ModelConfigTab({ employee, preview }: AgentConfigTabProps) {
  const { t } = useTranslation("common");
  const model = preview?.model;

  return (
    <div className="space-y-6">
      <ConfigSection title={t("aiEmployees.config.sections.model")}>
        <ReadonlyGrid
          rows={[
            { label: t("aiEmployees.form.model"), value: employee.model ?? model?.model },
            { label: t("aiEmployees.config.fields.contextWindow"), value: model?.contextWindow },
            { label: t("aiEmployees.config.fields.reasoning"), value: model?.reasoning },
            { label: t("aiEmployees.config.fields.vision"), value: model?.vision },
            { label: t("aiEmployees.config.fields.functionCalling"), value: model?.functionCalling },
            { label: t("aiEmployees.config.fields.streaming"), value: model?.streaming },
            { label: t("aiEmployees.config.fields.maxOutputTokens"), value: model?.maxOutputTokens },
          ]}
        />
      </ConfigSection>
      <ValidationList preview={preview} />
    </div>
  );
}
