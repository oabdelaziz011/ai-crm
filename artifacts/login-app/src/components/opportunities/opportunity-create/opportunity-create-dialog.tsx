import { Briefcase, Loader2, Paperclip, Plus, X } from "lucide-react";
import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import type {
  OpportunityFormDraft,
  OpportunityFormFieldErrors,
  OpportunityLeadSeedSource,
  OpportunityStageOption,
} from "@/components/opportunities/opportunity-form-draft";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  buildLeadOpportunityFormSeed,
  buildManualOpportunityFormSeed,
  EMPTY_OPPORTUNITY_FORM_DRAFT,
  hasOpportunityFormErrors,
  opportunityFormDraftToCreateFromLeadInput,
  opportunityFormDraftToManualCreateInput,
  validateOpportunityFormDraft,
} from "@/components/opportunities/opportunity-form-draft";
import {
  useExistingOpportunityForLead,
  useOpportunityCreateFormOptions,
  useOpportunityStages,
} from "@/hooks/opportunities/use-opportunity-create-form-options";
import { useOpportunityCommands } from "@/hooks/opportunities/use-opportunity-commands";
import { useProductCatalog, useProductCommands } from "@/hooks/products/use-product-commands";
import { useEntityWorkspaceServices } from "@/hooks/entity-workspace/use-entity-workspace-services";
import { resolveApplicationErrorMessage } from "@/lib/application-layer/application-layer-result";
import { formatBillingCurrency } from "@/lib/billing/format";
import { validateEntityNoteFiles } from "@/lib/entity-workspace/services/entity-file-upload";
import { OpportunityCreateDuplicateGate } from "./opportunity-create-duplicate-gate";
import {
  OpportunityCreateFieldShell,
  OpportunityCreateReadOnlyValue,
  OpportunityCreateSection,
  opportunityCreateInputClass,
} from "./opportunity-create-primitives";

export type OpportunityCreateSource =
  | { mode: "manual" }
  | { mode: "fromLead"; lead: OpportunityLeadSeedSource };

export type OpportunityCreateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: OpportunityCreateSource;
  onCreated: (opportunityId: string) => void;
};

const CREATE_ATTACHMENT_ACCEPT =
  ".pdf,.docx,.jpg,.jpeg,.png,.webp,.zip,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png,image/webp,application/zip";

function buildStageMap(stages: OpportunityStageOption[]): Map<string, OpportunityStageOption> {
  return new Map(stages.map((stage) => [stage.id, stage]));
}

export function OpportunityCreateDialog({
  open,
  onOpenChange,
  source,
  onCreated,
}: OpportunityCreateDialogProps) {
  const { t } = useTranslation("common");
  const commands = useOpportunityCommands();
  const productCommands = useProductCommands();
  const entityServices = useEntityWorkspaceServices();
  const catalogQuery = useProductCatalog({ activeOnly: true });
  const formOptions = useOpportunityCreateFormOptions();
  const isFromLead = source.mode === "fromLead";
  const lead = isFromLead ? source.lead : null;
  const existingQuery = useExistingOpportunityForLead(lead?.id ?? null, open && isFromLead);
  const existingOpportunity = existingQuery.data ?? null;

  const [draft, setDraft] = useState<OpportunityFormDraft>(EMPTY_OPPORTUNITY_FORM_DRAFT);
  const [errors, setErrors] = useState<OpportunityFormFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [forceCreate, setForceCreate] = useState(false);

  const selectedPipelineId = draft.pipelineId || formOptions.defaultPipelineId;
  const stagesQuery = useOpportunityStages(selectedPipelineId || null);
  const stageOptions = useMemo((): OpportunityStageOption[] => {
    return (stagesQuery.data ?? [])
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((stage) => ({
        id: stage.id,
        label: stage.name,
        defaultProbabilityPercent: stage.defaultProbabilityPercent,
      }));
  }, [stagesQuery.data]);
  const stageById = useMemo(() => buildStageMap(stageOptions), [stageOptions]);

  const pending =
    source.mode === "fromLead" ? commands.createFromLead.isPending : commands.create.isPending;

  const seedKey = useMemo(() => {
    if (!open) return null;
    if (isFromLead && lead) return lead.id;
    return "manual";
  }, [open, isFromLead, lead]);

  const emptyLabel = t("opportunities360.emptyValue");
  const selectedStage = stageById.get(draft.stageId);
  const autoProbability = selectedStage?.defaultProbabilityPercent ?? null;
  const revenuePreview = draft.expectedRevenue.trim()
    ? formatBillingCurrency(Number(draft.expectedRevenue), draft.currency)
    : null;

  const priorityOptions = useMemo(
    () =>
      (
        [
          ["low", "opportunities.createForm.priority.low"],
          ["medium", "opportunities.createForm.priority.medium"],
          ["high", "opportunities.createForm.priority.high"],
          ["critical", "opportunities.createForm.priority.critical"],
        ] as const
      ).map(([id, key]) => ({ id, label: t(key) })),
    [t],
  );

  const productOptions = useMemo(
    () =>
      (catalogQuery.data?.items ?? []).map((product) => ({
        id: product.id,
        label: product.name,
      })),
    [catalogQuery.data?.items],
  );

  const leadAi = lead?.ai;
  const hasAiRecommendation =
    Boolean(leadAi?.score != null) ||
    Boolean(leadAi?.winProbability != null) ||
    Boolean(leadAi?.suggestedNextStep?.trim()) ||
    Boolean(leadAi?.suggestedStage?.trim());

  useEffect(() => {
    if (!open) {
      setForceCreate(false);
      return;
    }
    if (formOptions.isLoading || stagesQuery.isLoading) return;
    const firstStage = stageOptions[0];
    const seedDefaults = {
      companyCurrency: formOptions.companyCurrency,
      defaultOwnerUserId: formOptions.defaultOwnerUserId,
      defaultStageId: firstStage?.id ?? formOptions.defaultStageId,
      defaultPipelineId: formOptions.defaultPipelineId,
      defaultProbabilityPercent: firstStage?.defaultProbabilityPercent,
    };
    if (isFromLead && lead) {
      setDraft(buildLeadOpportunityFormSeed(lead, seedDefaults));
    } else {
      setDraft(buildManualOpportunityFormSeed(seedDefaults));
    }
    setErrors({});
    setFormError(null);
    setAttempted(false);
    setTagDraft("");
    setAttachments([]);
    setAttachmentError(null);
    setForceCreate(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed when dialog opens or lead target changes
  }, [open, seedKey, formOptions.isLoading, formOptions.defaultPipelineId, stagesQuery.isLoading, stageOptions.length]);

  useEffect(() => {
    if (draft.probabilityMode !== "auto" || autoProbability == null) return;
    setDraft((prev) =>
      prev.probabilityPercent === String(autoProbability)
        ? prev
        : { ...prev, probabilityPercent: String(autoProbability) },
    );
  }, [draft.probabilityMode, autoProbability]);

  const patch = <K extends keyof OpportunityFormDraft>(key: K, value: OpportunityFormDraft[K]) => {
    setDraft((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "pipelineId") {
        next.stageId = "";
        next.probabilityPercent = "";
      }
      if (key === "stageId" && prev.probabilityMode === "auto") {
        const stage = stageById.get(String(value));
        next.probabilityPercent =
          stage?.defaultProbabilityPercent != null ? String(stage.defaultProbabilityPercent) : "";
      }
      return next;
    });
    if (attempted) {
      setErrors((prev) => {
        const nextDraft = { ...draft, [key]: value };
        const next = validateOpportunityFormDraft(nextDraft, t, stageById);
        const copy = { ...prev };
        delete copy[key];
        if (next[key]) copy[key] = next[key];
        return copy;
      });
    }
  };

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

  const handleAttachmentChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;
    const merged = [...attachments, ...files];
    const validation = validateEntityNoteFiles(merged);
    if (!validation.ok) {
      setAttachmentError(t("opportunities.createForm.errors.attachmentsInvalid"));
      return;
    }
    setAttachmentError(null);
    setAttachments(validation.files);
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  };

  const persistAttachments = async (opportunityId: string) => {
    if (!attachments.length || !entityServices) return;
    const body =
      draft.notes.trim() ||
      t("opportunities.createForm.attachments.defaultNote");
    await entityServices.notes.create({
      tenantId: entityServices.ctx.companyId,
      entityType: "opportunity",
      entityId: opportunityId,
      text: body,
      createdBy: entityServices.ctx.actorUserId,
      createdByName: entityServices.displayName,
      files: attachments,
      sourceModule: "opportunities",
    });
  };

  const persistProducts = async (opportunityId: string) => {
    for (const productId of draft.expectedProductIds) {
      await productCommands.attachToOpportunity.mutateAsync({ opportunityId, productId });
    }
  };

  const handleSubmit = async () => {
    setAttempted(true);
    const nextErrors = validateOpportunityFormDraft(draft, t, stageById);
    setErrors(nextErrors);
    if (hasOpportunityFormErrors(nextErrors)) return;

    setFormError(null);

    try {
      let opportunityId: string;
      if (isFromLead && lead) {
        const opp = await commands.createFromLead.mutateAsync(
          opportunityFormDraftToCreateFromLeadInput(lead.id, draft, stageById, {
            forceCreate,
          }),
        );
        opportunityId = opp.id;
      } else {
        const opp = await commands.create.mutateAsync(
          opportunityFormDraftToManualCreateInput(draft, stageById),
        );
        opportunityId = opp.id;
      }

      if (draft.expectedProductIds.length) {
        await persistProducts(opportunityId);
      }
      if (attachments.length) {
        await persistAttachments(opportunityId);
      } else if (draft.notes.trim() && entityServices) {
        await entityServices.notes.create({
          tenantId: entityServices.ctx.companyId,
          entityType: "opportunity",
          entityId: opportunityId,
          text: draft.notes.trim(),
          createdBy: entityServices.ctx.actorUserId,
          createdByName: entityServices.displayName,
          files: [],
          sourceModule: "opportunities",
        });
      }

      onOpenChange(false);
      onCreated(opportunityId);
    } catch (error) {
      setFormError(resolveApplicationErrorMessage(error));
    }
  };

  const showDuplicateGate =
    isFromLead && !forceCreate && existingQuery.isSuccess && existingOpportunity;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-full max-w-[900px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[860px]">
        <DialogHeader className="shrink-0 border-b border-border/60 px-6 py-4 text-start sm:px-7">
          <DialogTitle className="flex items-center gap-2 text-[1.125rem] font-semibold tracking-[-0.02em]">
            <Briefcase className="size-4" />
            {t("opportunities.createForm.title")}
          </DialogTitle>
          <DialogDescription className="text-[13px] text-muted-foreground">
            {t("opportunities.createForm.subtitle")}
          </DialogDescription>
        </DialogHeader>

        {existingQuery.isLoading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="me-2 size-4 animate-spin" />
            {t("opportunities.createForm.checkingExisting")}
          </div>
        ) : showDuplicateGate ? (
          <div className="px-6 py-4 sm:px-7">
            <OpportunityCreateDuplicateGate
              opportunityName={existingOpportunity.name}
              onCancel={() => onOpenChange(false)}
              onOpenExisting={() => {
                const opportunityId = existingOpportunity.id;
                onOpenChange(false);
                onCreated(opportunityId);
              }}
              onCreateAnyway={() => setForceCreate(true)}
            />
          </div>
        ) : formOptions.isLoading || stagesQuery.isLoading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="me-2 size-4 animate-spin" />
            {t("opportunities.createForm.loadingForm")}
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 space-y-7 overflow-y-auto px-6 py-5 sm:px-7">
              <OpportunityCreateSection title={t("opportunities.createForm.sections.opportunity")}>
                <div className="grid gap-3.5 sm:grid-cols-2">
                  <OpportunityCreateFieldShell
                    label={t("opportunities.createForm.fields.name")}
                    htmlFor="opp-create-name"
                    required
                    error={errors.name}
                    className="sm:col-span-2"
                  >
                    <Input
                      id="opp-create-name"
                      className={opportunityCreateInputClass}
                      value={draft.name}
                      onChange={(event) => patch("name", event.target.value)}
                      placeholder={t("opportunities.createForm.fields.namePlaceholder")}
                    />
                  </OpportunityCreateFieldShell>

                  <OpportunityCreateFieldShell
                    label={t("opportunities.createForm.fields.pipeline")}
                    htmlFor="opp-create-pipeline"
                    required
                    error={errors.pipelineId}
                  >
                    <Select
                      value={draft.pipelineId}
                      onValueChange={(value) => patch("pipelineId", value)}
                    >
                      <SelectTrigger id="opp-create-pipeline" className={opportunityCreateInputClass}>
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
                  </OpportunityCreateFieldShell>

                  <OpportunityCreateFieldShell
                    label={t("opportunities.createForm.fields.stage")}
                    htmlFor="opp-create-stage"
                    required
                    error={errors.stageId}
                  >
                    <Select value={draft.stageId} onValueChange={(value) => patch("stageId", value)}>
                      <SelectTrigger id="opp-create-stage" className={opportunityCreateInputClass}>
                        <SelectValue
                          placeholder={t("opportunities.createForm.fields.stagePlaceholder")}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {stageOptions.map((option) => (
                          <SelectItem key={option.id} value={option.id}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </OpportunityCreateFieldShell>

                  <OpportunityCreateFieldShell
                    label={t("opportunities.createForm.fields.owner")}
                    htmlFor="opp-create-owner"
                    required
                    error={errors.ownerUserId}
                  >
                    <Select
                      value={draft.ownerUserId}
                      onValueChange={(value) => patch("ownerUserId", value)}
                    >
                      <SelectTrigger id="opp-create-owner" className={opportunityCreateInputClass}>
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
                  </OpportunityCreateFieldShell>

                  <OpportunityCreateFieldShell
                    label={t("opportunities.createForm.fields.priority")}
                    htmlFor="opp-create-priority"
                    required
                    error={errors.priority}
                  >
                    <Select
                      value={draft.priority || undefined}
                      onValueChange={(value) =>
                        patch("priority", value as OpportunityFormDraft["priority"])
                      }
                    >
                      <SelectTrigger id="opp-create-priority" className={opportunityCreateInputClass}>
                        <SelectValue
                          placeholder={t("opportunities.createForm.fields.priorityPlaceholder")}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {priorityOptions.map((option) => (
                          <SelectItem key={option.id} value={option.id}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </OpportunityCreateFieldShell>

                  <OpportunityCreateFieldShell
                    label={t("opportunities.createForm.fields.closeDate")}
                    htmlFor="opp-create-close"
                    required
                    error={errors.expectedCloseDate}
                  >
                    <Input
                      id="opp-create-close"
                      type="date"
                      className={opportunityCreateInputClass}
                      value={draft.expectedCloseDate}
                      onChange={(event) => patch("expectedCloseDate", event.target.value)}
                    />
                  </OpportunityCreateFieldShell>
                </div>
              </OpportunityCreateSection>

              {isFromLead && lead ? (
                <OpportunityCreateSection title={t("opportunities.createForm.sections.customer")}>
                  <div className="grid gap-3 rounded-lg border border-border/60 bg-muted/20 p-3 sm:grid-cols-2">
                    {lead.customerId ? (
                      <OpportunityCreateReadOnlyValue
                        label={t("opportunities.createForm.fields.customer")}
                        value={lead.customerName ?? lead.contactPerson ?? ""}
                        emptyLabel={emptyLabel}
                      />
                    ) : null}
                    <OpportunityCreateReadOnlyValue
                      label={t("opportunities.createForm.fields.company")}
                      value={lead.companyName ?? ""}
                      emptyLabel={emptyLabel}
                    />
                    {!lead.customerId ? (
                      <OpportunityCreateReadOnlyValue
                        label={t("opportunities.createForm.fields.lead")}
                        value={lead.name}
                        emptyLabel={emptyLabel}
                      />
                    ) : null}
                    <OpportunityCreateReadOnlyValue
                      label={t("opportunities.createForm.fields.contact")}
                      value={lead.contactPerson ?? ""}
                      emptyLabel={emptyLabel}
                    />
                    <OpportunityCreateReadOnlyValue
                      label={t("opportunities.createForm.fields.phone")}
                      value={lead.phone ?? ""}
                      emptyLabel={emptyLabel}
                    />
                    <OpportunityCreateReadOnlyValue
                      label={t("opportunities.createForm.fields.whatsapp")}
                      value={lead.whatsapp ?? ""}
                      emptyLabel={emptyLabel}
                    />
                    <OpportunityCreateReadOnlyValue
                      label={t("opportunities.createForm.fields.email")}
                      value={lead.email ?? ""}
                      emptyLabel={emptyLabel}
                    />
                    <OpportunityCreateReadOnlyValue
                      label={t("opportunities.createForm.fields.leadSource")}
                      value={lead.leadSource ?? ""}
                      emptyLabel={emptyLabel}
                    />
                  </div>
                </OpportunityCreateSection>
              ) : null}

              <OpportunityCreateSection title={t("opportunities.createForm.sections.commercial")}>
                <div className="grid gap-3.5 sm:grid-cols-2">
                  <OpportunityCreateFieldShell
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
                        className={cn(opportunityCreateInputClass, "flex-1")}
                        value={draft.expectedRevenue}
                        onChange={(event) => patch("expectedRevenue", event.target.value)}
                        placeholder={t("opportunities.createForm.fields.amountPlaceholder")}
                      />
                      <span className="shrink-0 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-[13px] font-semibold tabular-nums">
                        {draft.currency}
                      </span>
                    </div>
                    {revenuePreview ? (
                      <p className="text-[12px] text-muted-foreground">{revenuePreview}</p>
                    ) : null}
                  </OpportunityCreateFieldShell>

                  <OpportunityCreateFieldShell
                    label={t("opportunities.createForm.fields.currency")}
                    htmlFor="opp-create-currency"
                    required
                    error={errors.currency}
                  >
                    <Input
                      id="opp-create-currency"
                      className={opportunityCreateInputClass}
                      value={draft.currency}
                      readOnly
                      aria-readonly
                    />
                  </OpportunityCreateFieldShell>

                  <OpportunityCreateFieldShell
                    label={t("opportunities.createForm.fields.probability")}
                    htmlFor="opp-create-probability-mode"
                    error={errors.probabilityPercent}
                    className="sm:col-span-2"
                  >
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Select
                        value={draft.probabilityMode}
                        onValueChange={(value) =>
                          patch("probabilityMode", value as OpportunityFormDraft["probabilityMode"])
                        }
                      >
                        <SelectTrigger
                          id="opp-create-probability-mode"
                          className={opportunityCreateInputClass}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">
                            {t("opportunities.createForm.probability.auto")}
                          </SelectItem>
                          <SelectItem value="manual">
                            {t("opportunities.createForm.probability.manual")}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      {draft.probabilityMode === "manual" ? (
                        <Input
                          id="opp-create-probability"
                          type="number"
                          min={0}
                          max={100}
                          className={opportunityCreateInputClass}
                          value={draft.probabilityPercent}
                          onChange={(event) => patch("probabilityPercent", event.target.value)}
                          placeholder={t("opportunities.createForm.fields.probabilityPlaceholder")}
                        />
                      ) : (
                        <div className={cn(opportunityCreateInputClass, "flex items-center px-3 tabular-nums")}>
                          {autoProbability != null
                            ? t("opportunities.createForm.probability.autoValue", {
                                value: autoProbability,
                              })
                            : emptyLabel}
                        </div>
                      )}
                    </div>
                  </OpportunityCreateFieldShell>

                  <OpportunityCreateFieldShell
                    label={t("opportunities.createForm.fields.expectedProducts")}
                    htmlFor="opp-create-products"
                    className="sm:col-span-2"
                  >
                    <Select
                      value=""
                      onValueChange={(value) => {
                        if (!value || draft.expectedProductIds.includes(value)) return;
                        patch("expectedProductIds", [...draft.expectedProductIds, value]);
                      }}
                    >
                      <SelectTrigger id="opp-create-products" className={opportunityCreateInputClass}>
                        <SelectValue
                          placeholder={t("opportunities.createForm.fields.expectedProductsPlaceholder")}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {productOptions.map((option) => (
                          <SelectItem key={option.id} value={option.id}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {draft.expectedProductIds.length ? (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {draft.expectedProductIds.map((productId) => {
                          const label =
                            productOptions.find((option) => option.id === productId)?.label ??
                            productId;
                          return (
                            <span
                              key={productId}
                              className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-2.5 py-1 text-[12px]"
                            >
                              {label}
                              <button
                                type="button"
                                className="text-muted-foreground hover:text-foreground"
                                aria-label={t("opportunities.createForm.fields.removeProduct", {
                                  name: label,
                                })}
                                onClick={() =>
                                  patch(
                                    "expectedProductIds",
                                    draft.expectedProductIds.filter((id) => id !== productId),
                                  )
                                }
                              >
                                <X className="size-3" />
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    ) : null}
                  </OpportunityCreateFieldShell>
                </div>
              </OpportunityCreateSection>

              <OpportunityCreateSection title={t("opportunities.createForm.sections.additional")}>
                <OpportunityCreateFieldShell
                  label={t("opportunities.createForm.fields.tags")}
                  htmlFor="opp-create-tags"
                >
                  <div className="flex gap-2">
                    <Input
                      id="opp-create-tags"
                      className={opportunityCreateInputClass}
                      value={tagDraft}
                      onChange={(event) => setTagDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addTag();
                        }
                      }}
                      placeholder={t("opportunities.createForm.fields.tagsPlaceholder")}
                    />
                    <Button type="button" variant="outline" size="icon" onClick={addTag}>
                      <Plus className="size-4" />
                    </Button>
                  </div>
                  {draft.tags.length ? (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {draft.tags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-2.5 py-1 text-[12px]"
                        >
                          {tag}
                          <button
                            type="button"
                            className="text-muted-foreground hover:text-foreground"
                            aria-label={t("opportunities.createForm.fields.removeTag", { name: tag })}
                            onClick={() => patch("tags", draft.tags.filter((item) => item !== tag))}
                          >
                            <X className="size-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : null}
                </OpportunityCreateFieldShell>

                <OpportunityCreateFieldShell
                  label={t("opportunities.createForm.fields.notes")}
                  htmlFor="opp-create-notes"
                >
                  <Textarea
                    id="opp-create-notes"
                    className="min-h-[120px] rounded-lg border-border/70 bg-background text-[13px] shadow-none focus-visible:ring-1 focus-visible:ring-ring/40"
                    value={draft.notes}
                    onChange={(event) => patch("notes", event.target.value)}
                    placeholder={t("opportunities.createForm.fields.notesPlaceholder")}
                  />
                </OpportunityCreateFieldShell>

                <OpportunityCreateFieldShell
                  label={t("opportunities.createForm.fields.attachments")}
                  htmlFor="opp-create-attachments"
                  error={attachmentError ?? undefined}
                >
                  <label
                    htmlFor="opp-create-attachments"
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border/70 bg-muted/10 px-3 py-3 text-[13px] text-muted-foreground hover:bg-muted/20"
                  >
                    <Paperclip className="size-4 shrink-0" />
                    {t("opportunities.createForm.fields.attachmentsHint")}
                  </label>
                  <input
                    id="opp-create-attachments"
                    type="file"
                    multiple
                    accept={CREATE_ATTACHMENT_ACCEPT}
                    className="sr-only"
                    onChange={handleAttachmentChange}
                  />
                  {attachments.length ? (
                    <ul className="space-y-1 pt-1">
                      {attachments.map((file, index) => (
                        <li
                          key={`${file.name}-${index}`}
                          className="flex items-center justify-between gap-2 text-[12px]"
                        >
                          <span className="truncate">{file.name}</span>
                          <button
                            type="button"
                            className="text-muted-foreground hover:text-foreground"
                            onClick={() => removeAttachment(index)}
                          >
                            <X className="size-3" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </OpportunityCreateFieldShell>

                <div className="rounded-lg border border-border/60 bg-muted/15 p-3">
                  <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    {t("opportunities.createForm.fields.aiRecommendation")}
                  </p>
                  {hasAiRecommendation && leadAi ? (
                    <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                      {leadAi.score != null ? (
                        <div>
                          <dt className="text-[11px] text-muted-foreground">
                            {t("opportunities.createForm.fields.aiScore")}
                          </dt>
                          <dd className="text-[13px] font-semibold tabular-nums">{leadAi.score}</dd>
                        </div>
                      ) : null}
                      {leadAi.winProbability != null ? (
                        <div>
                          <dt className="text-[11px] text-muted-foreground">
                            {t("opportunities.createForm.fields.winProbability")}
                          </dt>
                          <dd className="text-[13px] font-semibold tabular-nums">
                            {leadAi.winProbability}%
                          </dd>
                        </div>
                      ) : null}
                      {leadAi.suggestedNextStep?.trim() ? (
                        <div className="sm:col-span-2">
                          <dt className="text-[11px] text-muted-foreground">
                            {t("opportunities.createForm.fields.suggestedNextStep")}
                          </dt>
                          <dd className="text-[13px]">{leadAi.suggestedNextStep}</dd>
                        </div>
                      ) : null}
                      {leadAi.suggestedStage?.trim() ? (
                        <div className="sm:col-span-2">
                          <dt className="text-[11px] text-muted-foreground">
                            {t("opportunities.createForm.fields.suggestedStage")}
                          </dt>
                          <dd className="text-[13px]">{leadAi.suggestedStage}</dd>
                        </div>
                      ) : null}
                    </dl>
                  ) : (
                    <p className="mt-2 text-[13px] text-muted-foreground">
                      {t("opportunities.createForm.fields.noAiRecommendation")}
                    </p>
                  )}
                </div>
              </OpportunityCreateSection>

              {formError ? <p className="text-[13px] text-destructive">{formError}</p> : null}
            </div>

            <DialogFooter className="shrink-0 border-t border-border/60 px-6 py-4 sm:px-7">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
                {t("buttons.cancel")}
              </Button>
              <Button type="button" disabled={pending} onClick={() => void handleSubmit()}>
                {pending ? <Loader2 className="me-2 size-4 animate-spin" /> : null}
                {t("buttons.create")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
