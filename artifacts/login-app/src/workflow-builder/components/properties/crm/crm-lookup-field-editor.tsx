import { useTranslation } from "react-i18next";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FieldBinding } from "@workspace/automation-platform";
import type { WorkflowDocument } from "../../../core/types";
import { FieldBindingEditor } from "../field-binding/field-binding-editor";

type LookupOption = {
  value: string;
  labelKey: string;
};

type CrmLookupFieldEditorProps = {
  lookupBy: string;
  lookupOptions: LookupOption[];
  valueBinding: unknown;
  onLookupByChange: (lookupBy: string) => void;
  onValueBindingChange: (binding: FieldBinding) => void;
  translationPrefix: string;
  document?: WorkflowDocument;
  nodeId?: string;
};

export function CrmLookupFieldEditor({
  lookupBy,
  lookupOptions,
  valueBinding,
  onLookupByChange,
  onValueBindingChange,
  translationPrefix,
  document,
  nodeId,
}: CrmLookupFieldEditorProps) {
  const { t } = useTranslation("common");

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>{t(`${translationPrefix}.lookupBy`, { defaultValue: "Lookup By" })}</Label>
        <Select value={lookupBy} onValueChange={onLookupByChange}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {lookupOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {t(`${translationPrefix}.${option.labelKey}`, { defaultValue: option.labelKey })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <FieldBindingEditor
        label={t(`${translationPrefix}.value`, { defaultValue: "Value" })}
        binding={valueBinding}
        onChange={onValueBindingChange}
        document={document}
        nodeId={nodeId}
      />
    </div>
  );
}
