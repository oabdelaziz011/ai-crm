import {
  AI_EXTRACT_NODE_KEY,
  EXTRACTION_FIELD_TYPES,
  patchExtractMetadata,
  readExtractMetadata,
  type ExtractionFieldType,
  type ExtractionSchemaField,
} from "@workspace/ai-workflow-platform";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useWorkflowBuilderAiI18n } from "@/workflow-builder/hooks/use-workflow-builder-ai-i18n";
import { readAIWorkflowConfig } from "./ai-workflow-config-utils";

type AIExtractionSchemaBuilderProps = {
  config: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
};

function updateSchema(
  config: Record<string, unknown>,
  fields: ExtractionSchemaField[],
): Record<string, unknown> {
  const aiConfig = readAIWorkflowConfig(config, AI_EXTRACT_NODE_KEY);
  return {
    aiConfig: patchExtractMetadata(aiConfig, {
      schema: { fields },
    }),
  };
}

function FieldEditor({
  field,
  onChange,
  onDelete,
}: {
  field: ExtractionSchemaField;
  onChange: (field: ExtractionSchemaField) => void;
  onDelete: () => void;
}) {
  const { ai } = useWorkflowBuilderAiI18n();

  return (
    <div className="space-y-3 rounded-xl border border-border/60 bg-background/50 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="grid flex-1 gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">{ai("sections.fieldName")}</Label>
            <Input
              value={field.name}
              placeholder={ai("placeholders.customerEmail")}
              onChange={(event) => onChange({ ...field, name: event.target.value })}
              className="rounded-xl bg-background/80"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">{ai("type")}</Label>
            <Select
              value={field.type}
              onValueChange={(value) => onChange({ ...field, type: value as ExtractionFieldType })}
            >
              <SelectTrigger className="rounded-xl bg-background/80">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXTRACTION_FIELD_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {ai(`fieldTypes.${type}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={onDelete} aria-label={ai("deleteField")}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">{ai("description")}</Label>
        <Input
          value={field.description ?? ""}
          placeholder={ai("placeholders.whatToExtract")}
          onChange={(event) => onChange({ ...field, description: event.target.value || null })}
          className="rounded-xl bg-background/80"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">{ai("sections.exampleValue")}</Label>
        <Input
          value={field.example ?? ""}
          placeholder={ai("placeholders.exampleForModel")}
          onChange={(event) => onChange({ ...field, example: event.target.value || null })}
          className="rounded-xl bg-background/80"
        />
      </div>

      {field.type === "enum" ? (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">{ai("sections.enumValues")}</Label>
          <Input
            value={(field.enumValues ?? []).join(", ")}
            placeholder={ai("placeholders.enumValues")}
            onChange={(event) =>
              onChange({
                ...field,
                enumValues: event.target.value
                  .split(",")
                  .map((entry) => entry.trim())
                  .filter(Boolean),
              })
            }
            className="rounded-xl bg-background/80"
          />
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        <Label className="text-sm">{ai("required")}</Label>
        <Switch checked={field.required} onCheckedChange={(checked) => onChange({ ...field, required: checked })} />
      </div>
    </div>
  );
}

export function AIExtractionSchemaBuilder({ config, onChange }: AIExtractionSchemaBuilderProps) {
  const { ai } = useWorkflowBuilderAiI18n();
  const aiConfig = readAIWorkflowConfig(config, AI_EXTRACT_NODE_KEY);
  const extract = readExtractMetadata(aiConfig);
  const fields = extract.schema.fields;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Label className="text-sm font-medium">{ai("sections.extractionSchema")}</Label>
          <p className="text-xs text-muted-foreground">{ai("sections.extractionSchemaHint")}</p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="rounded-xl"
          onClick={() =>
            onChange(
              updateSchema(config, [
                ...fields,
                {
                  id: crypto.randomUUID(),
                  name: `field_${fields.length + 1}`,
                  type: "string",
                  required: false,
                  description: null,
                  example: null,
                },
              ]),
            )
          }
        >
          <Plus className="me-2 h-4 w-4" />
          {ai("addField")}
        </Button>
      </div>

      <div className="space-y-3">
        {fields.map((field) => (
          <FieldEditor
            key={field.id}
            field={field}
            onChange={(next) =>
              onChange(updateSchema(config, fields.map((entry) => (entry.id === field.id ? next : entry))))
            }
            onDelete={() => onChange(updateSchema(config, fields.filter((entry) => entry.id !== field.id)))}
          />
        ))}
      </div>
    </div>
  );
}
