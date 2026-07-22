import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  buildInteractionSuggestions,
  type InteractionSuggestion,
} from "../../../core/variables/interaction-value-suggestions";
import { getInteractionValueSuggestionKind } from "../../../core/variables/interaction-variables";
import type { WorkflowDocument } from "../../../core/types";

type InteractionValueFieldProps = {
  field: string;
  value: string;
  nodeId?: string;
  document?: WorkflowDocument;
  onChange: (value: string) => void;
  className?: string;
};

function resolveSelectedSuggestionKey(
  value: string,
  suggestions: InteractionSuggestion[],
): string | undefined {
  if (!value) return undefined;
  const matches = suggestions.filter((entry) => entry.value === value);
  return matches[0]?.key;
}

export function InteractionValueField({
  field,
  value,
  nodeId,
  document,
  onChange,
  className,
}: InteractionValueFieldProps) {
  const { t } = useTranslation("common");
  const [advanced, setAdvanced] = useState(false);

  const suggestionKind = getInteractionValueSuggestionKind(field);

  const suggestions = useMemo(() => {
    if (!document || !nodeId || !suggestionKind) return [];
    return buildInteractionSuggestions(field, document, nodeId, (type) =>
      t(`workflowBuilder.logic.interactionTypes.${type}`, { defaultValue: type }),
    );
  }, [document, nodeId, field, suggestionKind, t]);

  const useSuggestions = suggestions.length > 0 && suggestionKind !== null;
  const selectedKey = resolveSelectedSuggestionKey(value, suggestions);

  const placeholder =
    suggestionKind === "type"
      ? t("workflowBuilder.logic.chooseInteractionType")
      : suggestionKind === "label"
        ? t("workflowBuilder.logic.chooseSelectionLabel")
        : t("workflowBuilder.logic.chooseSelectionValue");

  if (!useSuggestions) {
    return (
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={className ?? "rounded-xl bg-background/80"}
      />
    );
  }

  if (advanced) {
    return (
      <div className="space-y-2">
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={className ?? "rounded-xl bg-background/80"}
        />
        <button
          type="button"
          className="text-xs font-medium text-primary hover:underline"
          onClick={() => setAdvanced(false)}
        >
          {t("workflowBuilder.logic.useSuggestedValues")}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Select
        value={selectedKey}
        onValueChange={(key) => {
          const match = suggestions.find((entry) => entry.key === key);
          if (match) onChange(match.value);
        }}
      >
        <SelectTrigger className={className ?? "rounded-xl bg-background/80"}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {suggestions.map((entry) => (
            <SelectItem key={entry.key} value={entry.key}>
              {entry.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <button
        type="button"
        className="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
        onClick={() => setAdvanced(true)}
      >
        {t("workflowBuilder.logic.enterValueManually")}
      </button>
    </div>
  );
}
