import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Plus, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  EMPTY_LEADS_FORM_DRAFT,
  type LeadsFormDraft,
} from "@/components/leads/workspace/leads-form-draft";

/** @deprecated Prefer LeadsFormDraft — alias kept for existing imports. */
export type LeadsCreateDraft = LeadsFormDraft;

export type LeadsCreateOption = {
  id: string;
  label: string;
};

const EMPTY: LeadsCreateDraft = EMPTY_LEADS_FORM_DRAFT;

type FieldErrors = Partial<Record<keyof LeadsCreateDraft | "form", string>>;

function FieldShell({
  label,
  htmlFor,
  required,
  error,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor} className="text-[13px] font-medium text-foreground/90">
        {label}
        {required ? <span className="ms-0.5 text-destructive">*</span> : null}
      </Label>
      {children}
      {error ? <p className="text-[12px] text-destructive">{error}</p> : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3.5">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

const inputClass =
  "h-10 rounded-lg border-border/70 bg-background text-[13px] shadow-none focus-visible:ring-1 focus-visible:ring-ring/40";

export function LeadsCreateDialog({
  open,
  onOpenChange,
  onSubmit,
  isPending,
  stageOptions = [],
  ownerOptions = [],
  sourceOptions = [],
  defaultOwnerId,
  defaultStageId,
  mode = "create",
  initialDraft = null,
  seedKey = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (draft: LeadsCreateDraft) => Promise<void> | void;
  isPending: boolean;
  stageOptions?: LeadsCreateOption[];
  ownerOptions?: LeadsCreateOption[];
  sourceOptions?: LeadsCreateOption[];
  defaultOwnerId?: string;
  defaultStageId?: string;
  /** Reuses this same form as the Lead Edit dialog (no duplicate edit UI). */
  mode?: "create" | "edit";
  initialDraft?: LeadsCreateDraft | null;
  /** Stable key (e.g. lead id) so edit seeds refresh when the target lead changes. */
  seedKey?: string | null;
}) {
  const { t } = useTranslation("common");
  const [draft, setDraft] = useState(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [tagDraft, setTagDraft] = useState("");
  const [attempted, setAttempted] = useState(false);
  const isEdit = mode === "edit";

  const reset = () => {
    setDraft({
      ...EMPTY,
      ownerId: defaultOwnerId ?? "",
      stageId: defaultStageId ?? "",
    });
    setErrors({});
    setTagDraft("");
    setAttempted(false);
  };

  useEffect(() => {
    if (!open) return;
    if (isEdit && initialDraft) {
      setDraft({ ...EMPTY, ...initialDraft, tags: [...(initialDraft.tags ?? [])] });
    } else {
      setDraft({
        ...EMPTY,
        ownerId: defaultOwnerId || "",
        stageId: defaultStageId || "",
      });
    }
    setErrors({});
    setTagDraft("");
    setAttempted(false);
    // Seed only when the dialog opens or the edit target (seedKey) changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- avoid re-seeding on every parent render of initialDraft
  }, [open, isEdit, seedKey, defaultOwnerId, defaultStageId]);

  const patch = <K extends keyof LeadsCreateDraft>(key: K, value: LeadsCreateDraft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    if (attempted) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const validate = (value: LeadsCreateDraft): FieldErrors => {
    const next: FieldErrors = {};
    if (!value.name.trim()) {
      next.name = t("leads.workspace.validation.required");
    }
    if (!value.stageId) {
      next.stageId = t("leads.workspace.validation.required");
    }
    if (!value.ownerId) {
      next.ownerId = t("leads.workspace.validation.required");
    }
    if (value.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email.trim())) {
      next.email = t("leads.workspace.validation.email");
    }
    if (value.phone.trim() && !/^[\d+\s().-]{7,20}$/.test(value.phone.trim())) {
      next.phone = t("leads.workspace.validation.phone");
    }
    if (value.expectedValue.trim()) {
      const num = Number(value.expectedValue);
      if (Number.isNaN(num) || num < 0) {
        next.expectedValue = t("leads.workspace.validation.number");
      }
    }
    if (value.expectedCloseDate.trim()) {
      const date = new Date(value.expectedCloseDate);
      if (Number.isNaN(date.getTime())) {
        next.expectedCloseDate = t("leads.workspace.validation.date");
      }
    }
    return next;
  };

  const priorityOptions = useMemo(
    () => [
      { id: "low", label: t("leads.workspace.priority.low") },
      { id: "normal", label: t("leads.workspace.priority.normal") },
      { id: "high", label: t("leads.workspace.priority.high") },
      { id: "urgent", label: t("leads.workspace.priority.urgent") },
    ],
    [t],
  );

  const temperatureOptions = useMemo(
    () =>
      [
        { id: "hot" as const, label: t("leads.scoreBand.hot") },
        { id: "warm" as const, label: t("leads.scoreBand.warm") },
        { id: "cold" as const, label: t("leads.scoreBand.cold") },
      ] as const,
    [t],
  );

  const addTag = () => {
    const tag = tagDraft.trim();
    if (!tag) return;
    if (draft.tags.some((item) => item.toLowerCase() === tag.toLowerCase())) {
      setTagDraft("");
      return;
    }
    patch("tags", [...draft.tags, tag]);
    setTagDraft("");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="flex max-h-[min(92vh,880px)] w-[calc(100vw-1.5rem)] max-w-[900px] flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-[860px]">
        <DialogHeader className="shrink-0 border-b border-border/60 px-6 py-4 text-start sm:px-7">
          <DialogTitle className="text-[1.125rem] font-semibold tracking-[-0.02em]">
            {isEdit ? t("leads.workspace.editTitle") : t("leads.workspace.createTitle")}
          </DialogTitle>
          <DialogDescription className="text-[13px] text-muted-foreground">
            {isEdit ? t("leads.workspace.editSubtitle") : t("leads.workspace.createSubtitle")}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-7 overflow-y-auto px-6 py-5 sm:px-7">
          <Section title={t("leads.workspace.sections.basic")}>
            <div className="grid gap-3.5 sm:grid-cols-2">
              <FieldShell
                label={t("leads.workspace.fields.leadName")}
                htmlFor="lead-name"
                required
                error={errors.name}
                className="sm:col-span-2"
              >
                <Input
                  id="lead-name"
                  className={inputClass}
                  value={draft.name}
                  onChange={(e) => patch("name", e.target.value)}
                  placeholder={t("leads.workspace.placeholders.leadName")}
                  aria-invalid={Boolean(errors.name)}
                />
              </FieldShell>

              <FieldShell label={t("leads.workspace.fields.company")} htmlFor="lead-company">
                <Input
                  id="lead-company"
                  className={inputClass}
                  value={draft.companyName}
                  onChange={(e) => patch("companyName", e.target.value)}
                />
              </FieldShell>

              <FieldShell
                label={t("leads.workspace.fields.contactPerson")}
                htmlFor="lead-contact"
              >
                <Input
                  id="lead-contact"
                  className={inputClass}
                  value={draft.contactPerson}
                  onChange={(e) => patch("contactPerson", e.target.value)}
                />
              </FieldShell>

              <FieldShell
                label={t("leads.workspace.fields.email")}
                htmlFor="lead-email"
                error={errors.email}
              >
                <Input
                  id="lead-email"
                  type="email"
                  className={inputClass}
                  value={draft.email}
                  onChange={(e) => patch("email", e.target.value)}
                  aria-invalid={Boolean(errors.email)}
                />
              </FieldShell>

              <FieldShell label={t("leads.workspace.fields.phone")} htmlFor="lead-phone">
                <Input
                  id="lead-phone"
                  className={inputClass}
                  value={draft.phone}
                  onChange={(e) => patch("phone", e.target.value)}
                />
              </FieldShell>
            </div>
          </Section>

          <Section title={t("leads.workspace.sections.sales")}>
            <div className="grid gap-3.5 sm:grid-cols-2">
              <FieldShell
                label={t("leads.columns.stage")}
                htmlFor="lead-stage"
                required
                error={errors.stageId}
              >
                <Select value={draft.stageId || undefined} onValueChange={(v) => patch("stageId", v)}>
                  <SelectTrigger
                    id="lead-stage"
                    className={cn(inputClass, "w-full")}
                    aria-invalid={Boolean(errors.stageId)}
                  >
                    <SelectValue placeholder={t("leads.workspace.placeholders.select")} />
                  </SelectTrigger>
                  <SelectContent>
                    {stageOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldShell>

              <FieldShell
                label={t("leads.columns.owner")}
                htmlFor="lead-owner"
                required
                error={errors.ownerId}
              >
                <Select value={draft.ownerId || undefined} onValueChange={(v) => patch("ownerId", v)}>
                  <SelectTrigger
                    id="lead-owner"
                    className={cn(inputClass, "w-full")}
                    aria-invalid={Boolean(errors.ownerId)}
                  >
                    <SelectValue placeholder={t("leads.workspace.placeholders.select")} />
                  </SelectTrigger>
                  <SelectContent>
                    {ownerOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldShell>

              <FieldShell
                label={t("leads.columns.source")}
                htmlFor="lead-source"
                error={errors.sourceId}
              >
                <Select
                  value={draft.sourceId || undefined}
                  onValueChange={(v) => patch("sourceId", v)}
                >
                  <SelectTrigger
                    id="lead-source"
                    className={cn(inputClass, "w-full")}
                    aria-invalid={Boolean(errors.sourceId)}
                  >
                    <SelectValue placeholder={t("leads.workspace.placeholders.select")} />
                  </SelectTrigger>
                  <SelectContent>
                    {sourceOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldShell>

              <FieldShell
                label={t("leads.workspace.fields.expectedValue")}
                htmlFor="lead-value"
                error={errors.expectedValue}
              >
                <Input
                  id="lead-value"
                  type="number"
                  min={0}
                  className={inputClass}
                  value={draft.expectedValue}
                  onChange={(e) => patch("expectedValue", e.target.value)}
                />
              </FieldShell>

              <FieldShell
                label={t("leads.workspace.fields.expectedCloseDate")}
                htmlFor="lead-close"
                className="sm:col-span-2"
              >
                <Input
                  id="lead-close"
                  type="date"
                  className={inputClass}
                  value={draft.expectedCloseDate}
                  onChange={(e) => patch("expectedCloseDate", e.target.value)}
                />
              </FieldShell>
            </div>
          </Section>

          <Section title={t("leads.workspace.sections.classification")}>
            <div className="grid gap-3.5 sm:grid-cols-2">
              <FieldShell label={t("leads.workspace.fields.priority")} htmlFor="lead-priority">
                <Select
                  value={draft.priority || undefined}
                  onValueChange={(v) => patch("priority", v)}
                >
                  <SelectTrigger id="lead-priority" className={cn(inputClass, "w-full")}>
                    <SelectValue placeholder={t("leads.workspace.placeholders.select")} />
                  </SelectTrigger>
                  <SelectContent>
                    {priorityOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldShell>

              <FieldShell label={t("leads.workspace.fields.temperature")} htmlFor="lead-temp">
                <div id="lead-temp" className="grid grid-cols-3 gap-1.5">
                  {temperatureOptions.map((option) => {
                    const active = draft.temperature === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => patch("temperature", option.id)}
                        className={cn(
                          "h-10 rounded-lg border text-[13px] font-medium transition-colors",
                          active
                            ? "border-foreground/25 bg-foreground/[0.06] text-foreground"
                            : "border-border/70 bg-background text-muted-foreground hover:bg-muted/40",
                        )}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </FieldShell>

              <FieldShell
                label={t("leads.workspace.fields.tags")}
                htmlFor="lead-tags"
                className="sm:col-span-2"
              >
                <div className="rounded-lg border border-border/70 bg-background px-2.5 py-2">
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {draft.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-[12px] font-medium"
                      >
                        {tag}
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() =>
                            patch(
                              "tags",
                              draft.tags.filter((item) => item !== tag),
                            )
                          }
                          aria-label={t("leads.workspace.tags.remove", { tag })}
                        >
                          <X className="size-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      id="lead-tags"
                      className="h-8 border-0 bg-transparent px-1 text-[13px] shadow-none focus-visible:ring-0"
                      value={tagDraft}
                      onChange={(e) => setTagDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addTag();
                        }
                      }}
                      placeholder={t("leads.workspace.placeholders.tags")}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1 px-2 text-[12px]"
                      onClick={addTag}
                    >
                      <Plus className="size-3.5" />
                      {t("leads.workspace.tags.add")}
                    </Button>
                  </div>
                </div>
              </FieldShell>
            </div>
          </Section>

          <Section title={t("leads.workspace.sections.notes")}>
            <FieldShell label={t("leads.workspace.fields.notes")} htmlFor="lead-notes">
              <Textarea
                id="lead-notes"
                className="min-h-[120px] resize-y rounded-lg border-border/70 text-[13px] shadow-none focus-visible:ring-1 focus-visible:ring-ring/40"
                value={draft.notes}
                onChange={(e) => patch("notes", e.target.value)}
                placeholder={t("leads.workspace.placeholders.notes")}
              />
            </FieldShell>
          </Section>
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t border-border/60 bg-muted/15 px-6 py-4 sm:px-7">
          <Button
            type="button"
            variant="outline"
            className="h-10 rounded-lg px-4 text-[13px]"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            {t("buttons.cancel")}
          </Button>
          <Button
            type="button"
            className="h-11 min-w-[140px] rounded-lg px-5 text-[13px] font-semibold"
            disabled={isPending}
            onClick={async () => {
              setAttempted(true);
              const nextErrors = validate(draft);
              setErrors(nextErrors);
              if (Object.keys(nextErrors).length > 0) return;
              await onSubmit(draft);
            }}
          >
            {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            {isEdit ? t("leads.workspace.editSubmit") : t("leads.workspace.createSubmit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
