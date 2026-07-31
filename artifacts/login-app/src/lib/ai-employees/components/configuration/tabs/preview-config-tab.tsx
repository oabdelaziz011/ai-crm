import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import {
  AgentConfigTabProps,
  ConfigSection,
  ReadonlyGrid,
  ValidationList,
} from "@/lib/ai-employees/components/configuration/config-tab-shared";

export function PreviewConfigTab({ preview }: AgentConfigTabProps) {
  const { t } = useTranslation("common");
  const channelRuntime = preview?.channelRuntime;

  return (
    <div className="space-y-6">
      <ConfigSection title={t("aiEmployees.config.sections.preview")}>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={preview?.ready ? "default" : "secondary"}>
            {preview?.ready ? t("aiEmployees.config.ready") : t("aiEmployees.config.notReady")}
          </Badge>
          {preview?.missing.length ? (
            <Badge variant="outline">
              {t("aiEmployees.config.sections.missing")}: {preview.missing.join(", ")}
            </Badge>
          ) : null}
        </div>
      </ConfigSection>

      <ConfigSection title={t("aiEmployees.config.sections.binding")}>
        <ReadonlyGrid
          rows={[
            {
              label: t("aiEmployees.config.fields.channelBinding"),
              value: channelRuntime ? t("aiEmployees.config.fields.configured") : t("aiEmployees.config.fields.notConfigured"),
            },
            {
              label: t("aiEmployees.config.fields.providerConnection"),
              value: channelRuntime?.providerConnectionId ?? preview?.provider.providerConnectionId,
            },
            {
              label: t("aiEmployees.config.fields.streaming"),
              value: channelRuntime?.executionPolicy.streaming,
            },
            {
              label: t("aiEmployees.config.fields.executionTimeoutMs"),
              value: channelRuntime?.executionPolicy.maxDurationMs,
            },
            {
              label: t("aiEmployees.config.fields.allowedTools"),
              value: channelRuntime?.pageContext.allowedToolKeys.length ?? 0,
            },
          ]}
        />
      </ConfigSection>

      {channelRuntime?.knowledgeRetrieval ? (
        <ConfigSection title={t("aiEmployees.config.sections.knowledgeBinding")}>
          <ReadonlyGrid
            rows={[
              { label: t("aiEmployees.config.fields.collection"), value: channelRuntime.knowledgeRetrieval.collectionId },
              { label: t("aiEmployees.config.fields.topK"), value: channelRuntime.knowledgeRetrieval.topK },
              { label: t("aiEmployees.config.fields.minScore"), value: channelRuntime.knowledgeRetrieval.minScore },
            ]}
          />
        </ConfigSection>
      ) : null}

      <ValidationList preview={preview} />
    </div>
  );
}
