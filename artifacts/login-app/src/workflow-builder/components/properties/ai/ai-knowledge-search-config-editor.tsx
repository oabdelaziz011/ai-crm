import {
  AI_KNOWLEDGE_SEARCH_NODE_KEY,
  KNOWLEDGE_SEARCH_INPUT_SOURCES,
  patchKnowledgeSearchMetadata,
  readKnowledgeSearchMetadata,
  type KnowledgeSearchInputSource,
} from "@workspace/ai-workflow-platform";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useWorkflowBuilderAiI18n } from "@/workflow-builder/hooks/use-workflow-builder-ai-i18n";
import { readAIWorkflowConfig, patchAIWorkflowConfig } from "./ai-workflow-config-utils";

type AIKnowledgeSearchConfigEditorProps = {
  config: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
};

export function AIKnowledgeSearchConfigEditor({ config, onChange }: AIKnowledgeSearchConfigEditorProps) {
  const { ai, inputSource } = useWorkflowBuilderAiI18n();
  const aiConfig = readAIWorkflowConfig(config, AI_KNOWLEDGE_SEARCH_NODE_KEY);
  const search = readKnowledgeSearchMetadata(aiConfig);

  const patchSearch = (partial: Parameters<typeof patchKnowledgeSearchMetadata>[1]) => ({
    aiConfig: patchKnowledgeSearchMetadata(aiConfig, partial),
  });

  const patchKnowledge = (partial: Record<string, unknown>) =>
    patchAIWorkflowConfig(config, { knowledge: partial as never }, AI_KNOWLEDGE_SEARCH_NODE_KEY);

  return (
    <div className="space-y-4 rounded-xl border border-border/60 bg-background/50 p-3">
      <div>
        <Label className="text-sm font-medium">{ai("sections.knowledgeSearch")}</Label>
        <p className="text-xs text-muted-foreground">{ai("sections.knowledgeSearchHint")}</p>
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">{ai("sections.querySource")}</Label>
        <select
          className="w-full rounded-xl border border-input bg-background/80 px-3 py-2 text-sm"
          value={search.inputSource}
          onChange={(event) =>
            onChange(patchSearch({ inputSource: event.target.value as KnowledgeSearchInputSource }))
          }
        >
          {KNOWLEDGE_SEARCH_INPUT_SOURCES.map((source) => (
            <option key={source} value={source}>
              {inputSource(source)}
            </option>
          ))}
        </select>
      </div>

      {search.inputSource === "variable" ? (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">{ai("variableName")}</Label>
          <Input
            value={search.inputVariable ?? ""}
            placeholder={ai("placeholders.input")}
            onChange={(event) => onChange(patchSearch({ inputVariable: event.target.value }))}
            className="rounded-xl bg-background/80"
          />
        </div>
      ) : null}

      {["static", "custom_query"].includes(search.inputSource) ? (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">{ai("sections.searchQuery")}</Label>
          <Textarea
            value={search.staticQuery ?? ""}
            rows={3}
            onChange={(event) => onChange(patchSearch({ staticQuery: event.target.value }))}
            className="rounded-xl bg-background/80"
          />
        </div>
      ) : null}

      {["decision_output", "extract_output", "summarizer_output"].includes(search.inputSource) ? (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">{ai("sections.upstreamVariable")}</Label>
          <Input
            value={search.upstreamVariable ?? ""}
            placeholder={
              search.inputSource === "decision_output"
                ? ai("placeholders.decisionResult")
                : search.inputSource === "extract_output"
                  ? ai("placeholders.extractResult")
                  : ai("placeholders.summaryResult")
            }
            onChange={(event) => onChange(patchSearch({ upstreamVariable: event.target.value }))}
            className="rounded-xl bg-background/80"
          />
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">{ai("sections.collectionId")}</Label>
          <Input
            value={aiConfig.knowledge?.collectionId ?? ""}
            onChange={(event) => onChange(patchKnowledge({ collectionId: event.target.value || null }))}
            className="rounded-xl bg-background/80"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">{ai("outputVariable")}</Label>
          <Input
            value={aiConfig.outputVariable ?? "knowledge_result"}
            onChange={(event) =>
              onChange(patchAIWorkflowConfig(config, { outputVariable: event.target.value }, AI_KNOWLEDGE_SEARCH_NODE_KEY))
            }
            className="rounded-xl bg-background/80"
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">{ai("sections.embeddingConnectionId")}</Label>
          <Input
            value={aiConfig.knowledge?.embeddingConnectionId ?? ""}
            onChange={(event) => onChange(patchKnowledge({ embeddingConnectionId: event.target.value || null }))}
            className="rounded-xl bg-background/80"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">{ai("sections.vectorStoreConnectionId")}</Label>
          <Input
            value={aiConfig.knowledge?.vectorStoreConnectionId ?? ""}
            onChange={(event) => onChange(patchKnowledge({ vectorStoreConnectionId: event.target.value || null }))}
            className="rounded-xl bg-background/80"
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">{ai("sections.topK")}</Label>
          <Input
            type="number"
            min={1}
            max={100}
            value={search.topK}
            onChange={(event) => onChange(patchSearch({ topK: Number(event.target.value) || 1 }))}
            className="rounded-xl bg-background/80"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">{ai("sections.minimumScore")}</Label>
          <Input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={search.minimumScore}
            onChange={(event) => onChange(patchSearch({ minimumScore: Number(event.target.value) || 0 }))}
            className="rounded-xl bg-background/80"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">{ai("sections.maxChunks")}</Label>
          <Input
            type="number"
            min={1}
            max={100}
            value={search.maxChunks}
            onChange={(event) => onChange(patchSearch({ maxChunks: Number(event.target.value) || 1 }))}
            className="rounded-xl bg-background/80"
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">{ai("sections.tagsFilter")}</Label>
          <Input
            value={search.filters.tags.join(", ")}
            onChange={(event) =>
              onChange(
                patchSearch({
                  filters: {
                    ...search.filters,
                    tags: event.target.value
                      .split(",")
                      .map((tag) => tag.trim())
                      .filter(Boolean),
                  },
                }),
              )
            }
            className="rounded-xl bg-background/80"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">{ai("sections.categoriesFilter")}</Label>
          <Input
            value={search.filters.categories.join(", ")}
            onChange={(event) =>
              onChange(
                patchSearch({
                  filters: {
                    ...search.filters,
                    categories: event.target.value
                      .split(",")
                      .map((entry) => entry.trim())
                      .filter(Boolean),
                  },
                }),
              )
            }
            className="rounded-xl bg-background/80"
          />
        </div>
      </div>
    </div>
  );
}
