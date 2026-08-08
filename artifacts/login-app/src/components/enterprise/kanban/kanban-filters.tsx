import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { KanbanFilterOption, KanbanFiltersState } from "./types";
import { EMPTY_KANBAN_FILTERS } from "./types";

export function KanbanFilters({
  open,
  onOpenChange,
  title,
  applyLabel,
  resetLabel,
  value,
  onChange,
  onApply,
  owners,
  sources,
  scoreBands,
  stages,
  cities,
  countries,
  tags,
  fieldLabels,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  applyLabel: string;
  resetLabel: string;
  value: KanbanFiltersState;
  onChange: (next: KanbanFiltersState) => void;
  onApply: () => void;
  owners: readonly KanbanFilterOption[];
  sources: readonly KanbanFilterOption[];
  scoreBands: readonly KanbanFilterOption[];
  stages: readonly KanbanFilterOption[];
  cities: readonly KanbanFilterOption[];
  countries: readonly KanbanFilterOption[];
  tags: readonly KanbanFilterOption[];
  fieldLabels: {
    owner: string;
    source: string;
    score: string;
    city: string;
    country: string;
    stage: string;
    valueMin: string;
    valueMax: string;
    createdFrom: string;
    createdTo: string;
    lastActivityFrom: string;
    lastActivityTo: string;
    tags: string;
  };
}) {
  const patch = (partial: Partial<KanbanFiltersState>) => onChange({ ...value, ...partial });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <div className="mt-5 grid gap-4">
          <FilterSelect
            label={fieldLabels.owner}
            value={value.ownerId}
            options={owners}
            onChange={(ownerId) => patch({ ownerId })}
          />
          <FilterSelect
            label={fieldLabels.source}
            value={value.sourceId}
            options={sources}
            onChange={(sourceId) => patch({ sourceId })}
          />
          <FilterSelect
            label={fieldLabels.score}
            value={value.scoreBand}
            options={scoreBands}
            onChange={(scoreBand) => patch({ scoreBand })}
          />
          <FilterSelect
            label={fieldLabels.stage}
            value={value.stageId}
            options={stages}
            onChange={(stageId) => patch({ stageId })}
          />
          <FilterSelect
            label={fieldLabels.city}
            value={value.city}
            options={cities}
            onChange={(city) => patch({ city })}
          />
          <FilterSelect
            label={fieldLabels.country}
            value={value.country}
            options={countries}
            onChange={(country) => patch({ country })}
          />
          <FilterSelect
            label={fieldLabels.tags}
            value={value.tag}
            options={tags}
            onChange={(tag) => patch({ tag })}
          />
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label={fieldLabels.valueMin}
              value={value.valueMin}
              onChange={(valueMin) => patch({ valueMin })}
            />
            <NumberField
              label={fieldLabels.valueMax}
              value={value.valueMax}
              onChange={(valueMax) => patch({ valueMax })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <DateField
              label={fieldLabels.createdFrom}
              value={value.createdFrom}
              onChange={(createdFrom) => patch({ createdFrom })}
            />
            <DateField
              label={fieldLabels.createdTo}
              value={value.createdTo}
              onChange={(createdTo) => patch({ createdTo })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <DateField
              label={fieldLabels.lastActivityFrom}
              value={value.lastActivityFrom}
              onChange={(lastActivityFrom) => patch({ lastActivityFrom })}
            />
            <DateField
              label={fieldLabels.lastActivityTo}
              value={value.lastActivityTo}
              onChange={(lastActivityTo) => patch({ lastActivityTo })}
            />
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onChange({ ...EMPTY_KANBAN_FILTERS, search: value.search })}
            >
              {resetLabel}
            </Button>
            <Button
              type="button"
              onClick={() => {
                onApply();
                onOpenChange(false);
              }}
            >
              {applyLabel}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | null;
  options: readonly KanbanFilterOption[];
  onChange: (value: string | null) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[13px]">{label}</Label>
      <Select
        value={value ?? "__all__"}
        onValueChange={(next) => onChange(next === "__all__" ? null : next)}
      >
        <SelectTrigger className="h-10">
          <SelectValue placeholder={label} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">{label}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[13px]">{label}</Label>
      <Input
        type="number"
        className="h-10"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[13px]">{label}</Label>
      <Input
        type="date"
        className="h-10"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
