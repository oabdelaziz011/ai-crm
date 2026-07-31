import { useTranslation } from "react-i18next";
import {
  AgentConfigTabProps,
  ConfigSection,
  ReadonlyGrid,
  ValidationList,
} from "@/lib/ai-employees/components/configuration/config-tab-shared";

export function RuntimeConfigTab({ preview }: AgentConfigTabProps) {
  const { t } = useTranslation("common");
  const runtimeInfo = preview?.runtimeInfo;
  const runtimeFlags = preview?.runtimeFlags;

  return (
    <div className="space-y-6">
      <ConfigSection title={t("aiEmployees.config.sections.runtimeInfo")}>
        <ReadonlyGrid
          rows={[
            { label: t("aiEmployees.config.fields.currentRuntime"), value: runtimeInfo?.currentRuntime },
            { label: t("aiEmployees.config.fields.executionStatus"), value: runtimeInfo?.executionStatus },
            { label: t("aiEmployees.config.fields.coordinator"), value: runtimeInfo?.coordinator },
            { label: t("aiEmployees.config.fields.memoryMode"), value: runtimeInfo?.memoryMode },
            { label: t("aiEmployees.config.fields.checkpointStatus"), value: runtimeInfo?.checkpointStatus },
            {
              label: t("aiEmployees.config.fields.confirmationPolicy"),
              value: runtimeInfo?.confirmationPolicy,
            },
            { label: t("aiEmployees.config.fields.recoveryEnabled"), value: runtimeInfo?.recoveryEnabled },
          ]}
        />
      </ConfigSection>
      <ConfigSection title={t("aiEmployees.config.sections.runtimeFlags")}>
        <ReadonlyGrid
          rows={[
            { label: t("aiEmployees.config.fields.streaming"), value: runtimeFlags?.streaming },
            { label: t("aiEmployees.config.fields.memoryMode"), value: runtimeFlags?.memoryMode },
            {
              label: t("aiEmployees.config.fields.confirmationPolicy"),
              value: runtimeFlags?.confirmationPolicy,
            },
            { label: t("aiEmployees.config.fields.recoveryEnabled"), value: runtimeFlags?.recoveryEnabled },
            { label: t("aiEmployees.config.fields.checkpointEnabled"), value: runtimeFlags?.checkpointEnabled },
          ]}
        />
      </ConfigSection>
      <ValidationList preview={preview} />
    </div>
  );
}
