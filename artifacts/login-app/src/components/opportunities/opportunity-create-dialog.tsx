import { Briefcase, Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { OpportunityLeadSeedSource } from "@/components/opportunities/opportunity-form-draft";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  buildLeadOpportunityFormSeed,
  buildManualOpportunityFormSeed,
  EMPTY_OPPORTUNITY_FORM_DRAFT,
  hasOpportunityFormErrors,
  opportunityFormDraftToCreateFromLeadInput,
  opportunityFormDraftToManualCreateInput,
  validateOpportunityFormDraft,
  type OpportunityFormDraft,
  type OpportunityFormFieldErrors,
} from "@/components/opportunities/opportunity-form-draft";
import {
  useExistingOpportunityForLead,
  useOpportunityCreateFormOptions,
  useOpportunityStages,
} from "@/hooks/opportunities/use-opportunity-create-form-options";
import { useOpportunityCommands } from "@/hooks/opportunities/use-opportunity-commands";
import { resolveApplicationErrorMessage } from "@/lib/application-layer/application-layer-result";
import {
  resolveOpportunityCreateFlowView,
  type OpportunityCreateExistingCheckStatus,
} from "@/components/opportunities/opportunity-create-flow";

export type OpportunityCreateSource =
  | { mode: "manual" }
  | { mode: "fromLead"; lead: OpportunityLeadSeedSource };

export type OpportunityCreateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: OpportunityCreateSource;
  onCreated: (opportunityId: string) => void;
  /** Opens an existing opportunity without ever mounting the create form. */
  onOpenExisting?: (opportunityId: string) => void;
};

const inputClass =
  "h-10 rounded-lg border-border/70 bg-background text-[13px] shadow-none focus-visible:ring-1 focus-visible:ring-ring/40";

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

function ReadOnlyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-[12px] font-medium text-muted-foreground">{label}</p>
      <p className="text-[13px] text-foreground">{value || "—"}</p>
    </div>
  );
}

function toExistingCheckStatus(query: {
  isLoading: boolean;
  isFetching: boolean;
  isSuccess: boolean;
  isError: boolean;
  fetchStatus: string;
}): OpportunityCreateExistingCheckStatus {
  if (query.isLoading || (query.isFetching && !query.isSuccess && !query.isError)) {
    return "loading";
  }
  if (query.isSuccess) return "success";
  if (query.isError) return "error";
  if (query.fetchStatus === "idle") return "idle";
  return "loading";
}

export function OpportunityCreateDialog({
  open,
  onOpenChange,
  source,
  onCreated,
  onOpenExisting,
}: OpportunityCreateDialogProps) {
  const { t } = useTranslation("common");
  const commands = useOpportunityCommands();
  const formOptions = useOpportunityCreateFormOptions();
  const isFromLead = source.mode === "fromLead";
  const lead = isFromLead ? source.lead : null;
  const existingQuery = useExistingOpportunityForLead(lead?.id ?? null, open && isFromLead);
  const existingOpportunity = existingQuery.data ?? null;
  const [forceCreate, setForceCreate] = useState(false);

  const flowView = resolveOpportunityCreateFlowView({
    open,
    isFromLead,
    existingCheckStatus: toExistingCheckStatus(existingQuery),
    hasExisting: Boolean(existingOpportunity),
    forceCreate,
  });

  const gateOpen = flowView === "checking" || flowView === "gate";
  const formOpen = flowView === "form";

  const [draft, setDraft] = useState<OpportunityFormDraft>(EMPTY_OPPORTUNITY_FORM_DRAFT);
  const [errors, setErrors] = useState<OpportunityFormFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);

  const selectedPipelineId = draft.pipelineId || formOptions.defaultPipelineId;
  const stagesQuery = useOpportunityStages(selectedPipelineId || null);
  const stageOptions = useMemo(() => {
    return (stagesQuery.data ?? [])
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((stage) => ({ id: stage.id, label: stage.name }));
  }, [stagesQuery.data]);
  const firstStageId = stageOptions[0]?.id ?? formOptions.defaultStageId;

  const pending =
    source.mode === "fromLead" ? commands.createFromLead.isPending : commands.create.isPending;

  const seedKey = useMemo(() => {
    if (!formOpen) return null;
    if (isFromLead && lead) return lead.id;
    return "manual";
  }, [formOpen, isFromLead, lead]);
  const seededForKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) {
      setForceCreate(false);
      seededForKeyRef.current = null;
    }
  }, [open]);

  useEffect(() => {
    if (!formOpen) {
      seededForKeyRef.current = null;
      return;
    }
    if (formOptions.isLoading || stagesQuery.isLoading) return;
    if (!seedKey || seededForKeyRef.current === seedKey) return;
    seededForKeyRef.current = seedKey;

    const resolvedStageId = firstStageId || formOptions.defaultStageId;
    if (isFromLead && lead) {
      setDraft(
        buildLeadOpportunityFormSeed(lead, {
          companyCurrency: formOptions.companyCurrency,
          defaultOwnerUserId: formOptions.defaultOwnerUserId,
          defaultStageId: resolvedStageId,
          defaultPipelineId: formOptions.defaultPipelineId,
        }),
      );
    } else {
      setDraft(
        buildManualOpportunityFormSeed({
          companyCurrency: formOptions.companyCurrency,
          defaultOwnerUserId: formOptions.defaultOwnerUserId,
          defaultStageId: resolvedStageId,
          defaultPipelineId: formOptions.defaultPipelineId,
        }),
      );
    }
    setErrors({});
    setFormError(null);
    setAttempted(false);
  }, [
    formOpen,
    seedKey,
    isFromLead,
    lead,
    formOptions.isLoading,
    formOptions.companyCurrency,
    formOptions.defaultOwnerUserId,
    formOptions.defaultPipelineId,
    formOptions.defaultStageId,
    stagesQuery.isLoading,
    firstStageId,
  ]);

  useEffect(() => {
    if (!formOpen || stagesQuery.isLoading || !firstStageId) return;
    setDraft((prev) => {
      const stageStillValid = stageOptions.some((stage) => stage.id === prev.stageId);
      if (stageStillValid) return prev;
      return { ...prev, stageId: firstStageId };
    });
  }, [formOpen, stagesQuery.isLoading, firstStageId, stageOptions]);

  const patch = <K extends keyof OpportunityFormDraft>(key: K, value: OpportunityFormDraft[K]) => {
    setDraft((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "pipelineId") {
        next.stageId = "";
      }
      return next;
    });
    if (attempted) {
      setErrors((prev) => {
        const nextDraft =
          key === "pipelineId"
            ? { ...draft, [key]: value, stageId: firstStageId || "" }
            : { ...draft, [key]: value };
        const next = validateOpportunityFormDraft(nextDraft, t);
        const copy = { ...prev };
        delete copy[key];
        if (key === "pipelineId") delete copy.stageId;
        if (next[key]) copy[key] = next[key];
        return copy;
      });
    }
  };

  const handleSubmit = async () => {
    setAttempted(true);
    const resolvedDraft =
      !draft.stageId.trim() && firstStageId
        ? { ...draft, stageId: firstStageId }
        : draft;
    const nextErrors = validateOpportunityFormDraft(resolvedDraft, t);
    setErrors(nextErrors);
    if (hasOpportunityFormErrors(nextErrors)) return;

    setFormError(null);

    try {
      if (isFromLead && lead) {
        const opp = await commands.createFromLead.mutateAsync(
          opportunityFormDraftToCreateFromLeadInput(lead.id, resolvedDraft),
        );
        onOpenChange(false);
        onCreated(opp.id);
        return;
      }

      const opp = await commands.create.mutateAsync(
        opportunityFormDraftToManualCreateInput(resolvedDraft),
      );
      onOpenChange(false);
      onCreated(opp.id);
    } catch (error) {
      setFormError(resolveApplicationErrorMessage(error));
    }
  };

  const handleOpenExisting = () => {
    if (!existingOpportunity) return;
    const opportunityId = existingOpportunity.id;
    // Close the flow first so the create form never becomes eligible to mount.
    onOpenChange(false);
    if (onOpenExisting) {
      onOpenExisting(opportunityId);
    } else {
      onCreated(opportunityId);
    }
  };

  const formLoading = formOptions.isLoading || stagesQuery.isLoading;

  return (
    <>
      <Dialog
        open={gateOpen}
        onOpenChange={(next) => {
          if (!next) onOpenChange(false);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Briefcase className="size-4" />
              {t("opportunities.createForm.title")}
            </DialogTitle>
            <DialogDescription>
              {flowView === "checking"
                ? t("opportunities.createForm.checkingExisting")
                : t("opportunities.createForm.subtitle")}
            </DialogDescription>
          </DialogHeader>

          {flowView === "checking" ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="me-2 size-4 animate-spin" />
              {t("opportunities.createForm.checkingExisting")}
            </div>
          ) : existingOpportunity ? (
            <div className="space-y-4 py-1">
              <p className="text-[13px] text-muted-foreground">
                {t("opportunities.createForm.existingBody", { name: existingOpportunity.name })}
              </p>
              <DialogFooter className="gap-2 sm:justify-start">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  {t("buttons.cancel")}
                </Button>
                <Button type="button" onClick={handleOpenExisting}>
                  {t("opportunities.createForm.openExisting")}
                </Button>
              </DialogFooter>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={formOpen}
        onOpenChange={(next) => {
          if (!next) onOpenChange(false);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Briefcase className="size-4" />
              {t("opportunities.createForm.title")}
            </DialogTitle>
            <DialogDescription>{t("opportunities.createForm.subtitle")}</DialogDescription>
          </DialogHeader>

          {formLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="me-2 size-4 animate-spin" />
              {t("opportunities.createForm.loadingForm")}
            </div>
          ) : (
            <>
              <div className="space-y-6 py-2">
                <Section title={t("opportunities.createForm.sections.deal")}>
                  <FieldShell
                    label={t("opportunities.createForm.fields.name")}
                    htmlFor="opp-create-name"
                    required
                    error={errors.name}
                  >
                    <Input
                      id="opp-create-name"
                      className={inputClass}
                      value={draft.name}
                      onChange={(event) => patch("name", event.target.value)}
                      placeholder={t("opportunities.createForm.fields.namePlaceholder")}
                    />
                  </FieldShell>

                  {isFromLead && lead ? null : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <FieldShell
                        label={t("opportunities.createForm.fields.company")}
                        htmlFor="opp-create-company"
                        error={errors.companyName}
                      >
                        <Input
                          id="opp-create-company"
                          className={inputClass}
                          value={draft.companyName}
                          onChange={(event) => patch("companyName", event.target.value)}
                          placeholder={t("opportunities.createForm.fields.companyPlaceholder")}
                        />
                      </FieldShell>
                      <FieldShell
                        label={t("opportunities.createForm.fields.contact")}
                        htmlFor="opp-create-contact"
                        error={errors.primaryContactName}
                      >
                        <Input
                          id="opp-create-contact"
                          className={inputClass}
                          value={draft.primaryContactName}
                          onChange={(event) => patch("primaryContactName", event.target.value)}
                          placeholder={t("opportunities.createForm.fields.contactPlaceholder")}
                        />
                      </FieldShell>
                    </div>
                  )}
                </Section>

                {isFromLead && lead ? (
                  <Section title={t("opportunities.createForm.sections.source")}>
                    <div className="grid gap-3 rounded-lg border border-border/60 bg-muted/20 p-3 sm:grid-cols-2">
                      <ReadOnlyValue
                        label={t("opportunities.createForm.fields.leadTitle")}
                        value={lead.name}
                      />
                      <ReadOnlyValue
                        label={t("opportunities.createForm.fields.company")}
                        value={lead.companyName ?? ""}
                      />
                      <ReadOnlyValue
                        label={t("opportunities.createForm.fields.contact")}
                        value={lead.contactPerson ?? ""}
                      />
                      {lead.phone ? (
                        <ReadOnlyValue
                          label={t("opportunities.createForm.fields.phone")}
                          value={lead.phone}
                        />
                      ) : null}
                      {lead.email ? (
                        <ReadOnlyValue
                          label={t("opportunities.createForm.fields.leadEmail")}
                          value={lead.email}
                        />
                      ) : null}
                    </div>
                  </Section>
                ) : null}

                <Section title={t("opportunities.createForm.sections.commercial")}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <FieldShell
                      label={t("opportunities.createForm.fields.amount")}
                      htmlFor="opp-create-amount"
                      error={errors.expectedRevenue}
                    >
                      <div className="flex items-center gap-2">
                        <Input
                          id="opp-create-amount"
                          type="number"
                          min={0}
                          step="0.01"
                          className={cn(inputClass, "flex-1")}
                          value={draft.expectedRevenue}
                          onChange={(event) => patch("expectedRevenue", event.target.value)}
                          placeholder={t("opportunities.createForm.fields.amountPlaceholder")}
                        />
                        <span className="shrink-0 text-[13px] font-semibold tabular-nums text-muted-foreground">
                          {draft.currency}
                        </span>
                      </div>
                    </FieldShell>
                    <FieldShell
                      label={t("opportunities.createForm.fields.currency")}
                      htmlFor="opp-create-currency"
                      required
                      error={errors.currency}
                    >
                      <Input
                        id="opp-create-currency"
                        className={inputClass}
                        value={draft.currency}
                        readOnly
                        aria-readonly
                      />
                    </FieldShell>
                  </div>

                  <FieldShell
                    label={t("opportunities.createForm.fields.closeDate")}
                    htmlFor="opp-create-close"
                    error={errors.expectedCloseDate}
                  >
                    <Input
                      id="opp-create-close"
                      type="date"
                      className={inputClass}
                      value={draft.expectedCloseDate}
                      onChange={(event) => patch("expectedCloseDate", event.target.value)}
                    />
                  </FieldShell>

                  <FieldShell
                    label={t("opportunities.createForm.fields.pipeline")}
                    htmlFor="opp-create-pipeline"
                    required
                    error={errors.pipelineId}
                  >
                    <Select
                      value={draft.pipelineId}
                      onValueChange={(value) => patch("pipelineId", value)}
                    >
                      <SelectTrigger id="opp-create-pipeline" className={inputClass}>
                        <SelectValue
                          placeholder={t("opportunities.createForm.fields.pipelinePlaceholder")}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {formOptions.pipelineOptions.map((option) => (
                          <SelectItem key={option.id} value={option.id}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FieldShell>

                  <FieldShell
                    label={t("opportunities.createForm.fields.owner")}
                    htmlFor="opp-create-owner"
                    required
                    error={errors.ownerUserId}
                  >
                    <Select
                      value={draft.ownerUserId}
                      onValueChange={(value) => patch("ownerUserId", value)}
                    >
                      <SelectTrigger id="opp-create-owner" className={inputClass}>
                        <SelectValue
                          placeholder={t("opportunities.createForm.fields.ownerPlaceholder")}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {formOptions.ownerOptions.map((option) => (
                          <SelectItem key={option.id} value={option.id}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FieldShell>
                </Section>
              </div>

              {formError ? <p className="text-[13px] text-destructive">{formError}</p> : null}

              <DialogFooter className="gap-2 sm:justify-end">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  {t("buttons.cancel")}
                </Button>
                <Button type="button" disabled={pending} onClick={() => void handleSubmit()}>
                  {pending ? <Loader2 className="me-2 size-4 animate-spin" /> : null}
                  {t("opportunities.createForm.title")}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
