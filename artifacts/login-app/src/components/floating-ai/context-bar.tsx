import { memo } from "react";
import { Building2, Filter, User } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { FloatingAiPageContext } from "@/lib/floating-ai/types";
import { buildRuntimeMetadata } from "@/lib/floating-ai/global-context";

type ContextBarProps = {
  pageContext: FloatingAiPageContext;
};

function EntityChip({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof User;
}) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/5 px-2 py-1 text-xs">
      <Icon className="size-3 text-primary shrink-0" aria-hidden="true" />
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium text-foreground truncate max-w-[140px]">{value}</span>
    </div>
  );
}

export const ContextBar = memo(function ContextBar({ pageContext }: ContextBarProps) {
  const { t } = useTranslation("common");
  const metadata = buildRuntimeMetadata(pageContext);
  const moduleLabel = pageContext.moduleLabel ?? pageContext.page;
  const selectedCount = metadata.selectedCount;

  return (
    <div
      className="shrink-0 border-b border-border/60 bg-muted/20 px-3 py-2"
      role="region"
      aria-label={t("floatingAi.contextBar.label")}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground me-1">
          {t("floatingAi.contextBar.currentContext")}
        </span>

        <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-background/60 px-2 py-1 text-xs font-medium">
          <Building2 className="size-3 text-muted-foreground" aria-hidden="true" />
          {moduleLabel}
        </div>

        {metadata.currentEntity && (
          <EntityChip
            label={t(`floatingAi.entity.${metadata.currentEntity.type}`)}
            value={metadata.currentEntity.reference ?? metadata.currentEntity.label}
            icon={User}
          />
        )}

        {selectedCount > 0 && (
          <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-background/60 px-2 py-1 text-xs">
            {t("floatingAi.contextBar.selectedCount", { count: selectedCount })}
          </div>
        )}

        {metadata.filters && Object.keys(metadata.filters).length > 0 && (
          <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-background/60 px-2 py-1 text-xs text-muted-foreground">
            <Filter className="size-3" aria-hidden="true" />
            {t("floatingAi.contextBar.filtersActive")}
          </div>
        )}
      </div>
    </div>
  );
});
