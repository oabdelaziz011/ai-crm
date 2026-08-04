import { Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Customer360SectionConfig, Customer360SectionId, IntelligenceBlockConfig, IntelligenceBlockId } from "@workspace/universal-operations-engine";
import { WorkspacePanel } from "@/components/customer-workspace/workspace-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { newId } from "./config-editor-shared";
import type { ConfigTabEditorProps } from "./operations-config-tab-types";

const CUSTOMER360_SECTION_IDS: Customer360SectionId[] = [
  "todays_operation",
  "customer_summary",
  "communication",
  "timeline",
  "notes",
  "invoices_payments",
  "bookings",
  "files",
  "tasks",
  "ai_assistant",
];

const INTELLIGENCE_BLOCK_IDS: IntelligenceBlockId[] = [
  "context_ribbon",
  "workflow_tracker",
  "operational_intelligence",
  "alerts",
  "recommendations",
  "quick_decision_bar",
  "business_context",
  "mini_kpis",
  "floating_copilot",
];

function nextUnusedId<T extends string>(all: readonly T[], used: readonly string[]): T | null {
  return all.find((id) => !used.includes(id)) ?? null;
}

export function Customer360LayoutTab({ draft, updateDraft }: ConfigTabEditorProps) {
  const { t } = useTranslation("common");
  const sections = draft.customer360?.sections ?? [];

  const patch = (next: typeof sections) => updateDraft({ customer360: { sections: next } });

  return (
    <WorkspacePanel title={t("universalOperations.configuration.layouts.customer360")}>
      <div className="mb-3 flex justify-end">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            const nextSectionId = nextUnusedId(
              CUSTOMER360_SECTION_IDS,
              sections.map((section) => section.id),
            );
            if (!nextSectionId) return;
            const nextSection: Customer360SectionConfig = {
              id: nextSectionId,
              titleKey: `customer360.sections.${nextSectionId}`,
              visible: true,
              collapsed: false,
              permissions: [],
              roles: ["manager"],
              sortOrder: sections.length,
            };
            patch([...sections, nextSection]);
          }}
        >
          <Plus className="me-1 size-3.5" />
          {t("universalOperations.configuration.add")}
        </Button>
      </div>
      {sections.map((section, index) => (
        <div key={section.id} className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-border/50 p-2">
          <Input value={section.id} readOnly className="max-w-[140px] text-xs" />
          <Input
            value={section.titleKey}
            onChange={(e) => patch(sections.map((s) => (s.id === section.id ? { ...s, titleKey: e.target.value } : s)))}
          />
          <Input
            type="number"
            value={section.sortOrder}
            className="w-20"
            onChange={(e) => patch(sections.map((s) => (s.id === section.id ? { ...s, sortOrder: Number(e.target.value) } : s)))}
          />
          <label className="flex items-center gap-2 text-xs">
            <Switch checked={section.visible} onCheckedChange={(checked) => patch(sections.map((s) => (s.id === section.id ? { ...s, visible: checked } : s)))} />
            {t("universalOperations.configuration.columns.visible")}
          </label>
          <Button type="button" size="icon" variant="ghost" className="text-destructive" onClick={() => patch(sections.filter((s) => s.id !== section.id))}>
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ))}
    </WorkspacePanel>
  );
}

export function IntelligenceLayoutTab({ draft, updateDraft }: ConfigTabEditorProps) {
  const { t } = useTranslation("common");
  const intelligence = draft.intelligence ?? { blocks: [], workflowStages: [], journeySteps: [], alertRules: [], recommendationRules: [] };

  return (
    <div className="space-y-4">
      <WorkspacePanel title={t("universalOperations.configuration.layouts.intelligenceBlocks")}>
        <div className="mb-3 flex justify-end">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              const nextBlockId = nextUnusedId(
                INTELLIGENCE_BLOCK_IDS,
                intelligence.blocks.map((block) => block.id),
              );
              if (!nextBlockId) return;
              const nextBlock: IntelligenceBlockConfig = {
                id: nextBlockId,
                visible: true,
                collapsed: false,
                sortOrder: intelligence.blocks.length,
                permissions: [],
                roles: ["manager"],
              };
              updateDraft({
                intelligence: {
                  ...intelligence,
                  blocks: [...intelligence.blocks, nextBlock],
                },
              });
            }}
          >
            <Plus className="me-1 size-3.5" />
            {t("universalOperations.configuration.add")}
          </Button>
        </div>
        {intelligence.blocks.map((block) => (
          <div key={block.id} className="mb-2 flex items-center justify-between rounded-lg border border-border/50 px-3 py-2 text-sm">
            <span className="font-medium">{block.id}</span>
            <div className="flex items-center gap-2">
              <Switch
                checked={block.visible}
                onCheckedChange={(checked) =>
                  updateDraft({
                    intelligence: {
                      ...intelligence,
                      blocks: intelligence.blocks.map((b) => (b.id === block.id ? { ...b, visible: checked } : b)),
                    },
                  })
                }
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="text-destructive"
                onClick={() =>
                  updateDraft({
                    intelligence: {
                      ...intelligence,
                      blocks: intelligence.blocks.filter((b) => b.id !== block.id),
                    },
                  })
                }
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </WorkspacePanel>
      <WorkspacePanel title={t("universalOperations.configuration.layouts.workflow")}>
        <div className="mb-3 flex justify-end">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              updateDraft({
                intelligence: {
                  ...intelligence,
                  workflowStages: [
                    ...intelligence.workflowStages,
                    { id: newId("stage"), labelKey: "intelligence.stage.custom", sortOrder: intelligence.workflowStages.length },
                  ],
                },
              })
            }
          >
            <Plus className="me-1 size-3.5" />
            {t("universalOperations.configuration.add")}
          </Button>
        </div>
        {intelligence.workflowStages.map((stage, index) => (
          <div key={stage.id} className="mb-2 flex gap-2">
            <Input value={stage.id} readOnly className="max-w-[120px]" />
            <Input
              value={stage.labelKey}
              onChange={(e) =>
                updateDraft({
                  intelligence: {
                    ...intelligence,
                    workflowStages: intelligence.workflowStages.map((s) => (s.id === stage.id ? { ...s, labelKey: e.target.value } : s)),
                  },
                })
              }
            />
            <Input
              type="number"
              value={stage.sortOrder}
              className="w-20"
              onChange={(e) =>
                updateDraft({
                  intelligence: {
                    ...intelligence,
                    workflowStages: intelligence.workflowStages.map((s) => (s.id === stage.id ? { ...s, sortOrder: Number(e.target.value) } : s)),
                  },
                })
              }
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="text-destructive"
              onClick={() =>
                updateDraft({
                  intelligence: {
                    ...intelligence,
                    workflowStages: intelligence.workflowStages.filter((s) => s.id !== stage.id),
                  },
                })
              }
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}
      </WorkspacePanel>
    </div>
  );
}

export function KanbanLayoutTab({ draft, updateDraft }: ConfigTabEditorProps) {
  const { t } = useTranslation("common");
  const kanban = draft.kanban ?? { columns: [], groupBy: "status" as const };

  return (
    <WorkspacePanel title={t("universalOperations.configuration.layouts.kanban")}>
      <div className="mb-3 flex gap-2">
        <Label>{t("universalOperations.configuration.layouts.groupBy")}</Label>
        <select
          value={kanban.groupBy}
          className="h-9 rounded-md border border-input bg-background px-2 text-xs"
          onChange={(e) => updateDraft({ kanban: { ...kanban, groupBy: e.target.value as typeof kanban.groupBy } })}
        >
          <option value="status">status</option>
          <option value="resource">resource</option>
          <option value="priority">priority</option>
        </select>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="ms-auto"
          onClick={() =>
            updateDraft({
              kanban: {
                ...kanban,
                columns: [
                  ...kanban.columns,
                  {
                    id: newId("kanban"),
                    label: "New Column",
                    statusId: draft.statuses[0]?.id ?? "",
                    wipLimit: undefined,
                  },
                ],
              },
            })
          }
        >
          <Plus className="me-1 size-3.5" />
          {t("universalOperations.configuration.add")}
        </Button>
      </div>
      {kanban.columns.map((col) => (
        <div key={col.id} className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-border/50 p-2">
          <Input value={col.label} onChange={(e) => updateDraft({ kanban: { ...kanban, columns: kanban.columns.map((c) => (c.id === col.id ? { ...c, label: e.target.value } : c)) } })} />
          <select
            value={col.statusId}
            className="h-9 rounded-md border border-input bg-background px-2 text-xs"
            onChange={(e) => updateDraft({ kanban: { ...kanban, columns: kanban.columns.map((c) => (c.id === col.id ? { ...c, statusId: e.target.value } : c)) } })}
          >
            {draft.statuses.map((s) => (
              <option key={s.id} value={s.id}>
                {s.displayName}
              </option>
            ))}
          </select>
          <Input
            type="number"
            placeholder="WIP"
            className="w-20"
            value={col.wipLimit ?? ""}
            onChange={(e) => updateDraft({ kanban: { ...kanban, columns: kanban.columns.map((c) => (c.id === col.id ? { ...c, wipLimit: Number(e.target.value) || undefined } : c)) } })}
          />
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="text-destructive"
            onClick={() => updateDraft({ kanban: { ...kanban, columns: kanban.columns.filter((c) => c.id !== col.id) } })}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ))}
    </WorkspacePanel>
  );
}

export function CalendarLayoutTab({ draft, updateDraft }: ConfigTabEditorProps) {
  const { t } = useTranslation("common");
  const calendar = draft.calendar ?? { defaultView: "week" as const, slotMinutes: 30, showWeekends: true };

  return (
    <WorkspacePanel title={t("universalOperations.configuration.layouts.calendar")}>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label>{t("universalOperations.configuration.layouts.defaultView")}</Label>
          <select
            value={calendar.defaultView}
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
            onChange={(e) => updateDraft({ calendar: { ...calendar, defaultView: e.target.value as typeof calendar.defaultView } })}
          >
            <option value="day">day</option>
            <option value="week">week</option>
            <option value="month">month</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label>{t("universalOperations.configuration.layouts.slotMinutes")}</Label>
          <Input type="number" value={calendar.slotMinutes} onChange={(e) => updateDraft({ calendar: { ...calendar, slotMinutes: Number(e.target.value) } })} />
        </div>
        <label className="flex items-center gap-2 pt-6 text-sm">
          <Switch checked={calendar.showWeekends} onCheckedChange={(checked) => updateDraft({ calendar: { ...calendar, showWeekends: checked } })} />
          {t("universalOperations.configuration.layouts.showWeekends")}
        </label>
      </div>
    </WorkspacePanel>
  );
}

export function TimelineLayoutTab({ draft, updateDraft }: ConfigTabEditorProps) {
  const { t } = useTranslation("common");
  const timeline = draft.timeline ?? { groupBy: "date" as const, showAiEvents: true };

  return (
    <WorkspacePanel title={t("universalOperations.configuration.layouts.timeline")}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>{t("universalOperations.configuration.layouts.groupBy")}</Label>
          <select
            value={timeline.groupBy}
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
            onChange={(e) => updateDraft({ timeline: { ...timeline, groupBy: e.target.value as typeof timeline.groupBy } })}
          >
            <option value="date">date</option>
            <option value="status">status</option>
            <option value="resource">resource</option>
          </select>
        </div>
        <label className="flex items-center gap-2 pt-6 text-sm">
          <Switch checked={timeline.showAiEvents} onCheckedChange={(checked) => updateDraft({ timeline: { ...timeline, showAiEvents: checked } })} />
          {t("universalOperations.configuration.layouts.showAiEvents")}
        </label>
      </div>
    </WorkspacePanel>
  );
}
