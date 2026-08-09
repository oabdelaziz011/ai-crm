import { Filter, LayoutGrid, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { EnterpriseKanbanLabels, KanbanPipelineOption } from "./types";

export function KanbanToolbar({
  labels,
  title,
  pipelines,
  pipelineId,
  onPipelineChange,
  search,
  onSearchChange,
  onOpenFilters,
  onCustomizeColumns,
  onCreate,
  canCreate,
  filtersActive,
  className,
}: {
  labels: EnterpriseKanbanLabels;
  title?: string;
  pipelines: readonly KanbanPipelineOption[];
  pipelineId: string | null;
  onPipelineChange: (pipelineId: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
  onOpenFilters: () => void;
  onCustomizeColumns?: () => void;
  onCreate: () => void;
  canCreate: boolean;
  filtersActive?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[1.35rem] font-semibold tracking-tight">
            {title ?? labels.pageTitle}
          </h1>
        </div>
        {/*
          Same-row primary actions. In RTL, last flex item sits on the visual left (شمال):
          New Lead leftmost, pipeline selector beside it.
        */}
        <div className="flex shrink-0 flex-nowrap items-center gap-2">
          <Select value={pipelineId ?? undefined} onValueChange={onPipelineChange}>
            <SelectTrigger className="h-10 w-[min(100%,220px)]" aria-label={labels.pipeline}>
              <SelectValue placeholder={labels.pipeline} />
            </SelectTrigger>
            <SelectContent>
              {pipelines.map((pipeline) => (
                <SelectItem key={pipeline.id} value={pipeline.id}>
                  {pipeline.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {canCreate ? (
            <Button type="button" className="h-10 gap-2" onClick={onCreate}>
              <Plus className="size-4" aria-hidden />
              {labels.create}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={labels.searchPlaceholder}
            className="h-10 ps-9"
            aria-label={labels.searchPlaceholder}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-10 gap-2"
          onClick={onOpenFilters}
          aria-pressed={filtersActive}
        >
          <Filter className="size-4" aria-hidden />
          {labels.filters}
          {filtersActive ? (
            <span className="ms-1 size-1.5 rounded-full bg-foreground" aria-hidden />
          ) : null}
        </Button>
        {onCustomizeColumns ? (
          <Button
            type="button"
            variant="outline"
            className="h-10 gap-2"
            onClick={onCustomizeColumns}
          >
            <LayoutGrid className="size-4" aria-hidden />
            {labels.customizeColumns}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
