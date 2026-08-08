import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { useTranslation } from "react-i18next";
import { BrandAssetUploadCard } from "@/components/company-workspace/brand-center/brand-asset-upload-card";
import { BrandAssetsPanel } from "@/components/company-workspace/brand-center/brand-assets-panel";
import { BrandHealthCard } from "@/components/company-workspace/brand-center/brand-health-card";
import { BrandLastUpdatedCard } from "@/components/company-workspace/brand-center/brand-last-updated-card";
import { BrandLivePreview } from "@/components/company-workspace/brand-center/brand-live-preview";
import { BrandPreviewAllDrawer } from "@/components/company-workspace/brand-center/brand-preview-all-drawer";
import { BrandUsagePanel } from "@/components/company-workspace/brand-center/brand-usage-panel";
import { EmailIdentityStudio } from "@/components/company-workspace/brand-center/email-identity-studio";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCompanyWorkspace } from "@/context/company-workspace-context";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCompanyBrandCenter,
  useSaveCompanyBrandCenter,
} from "@/hooks/company-workspace/use-company-brand-center";
import { useCompanyIdentity } from "@/hooks/company-workspace/use-company-identity";
import { useToast } from "@/hooks/use-toast";
import { brandFocusSelector } from "@/lib/company-workspace/brand-center/brand-focus";
import type { BrandHealthTarget } from "@/lib/company-workspace/brand-center/brand-health";
import {
  createDefaultBrandDocument,
  DEFAULT_BRAND_COLORS,
} from "@/lib/company-workspace/brand-center/defaults";
import type {
  BrandLogoSlot,
  BrandPreviewSurface,
  CompanyBrandCenterDocument,
  CompanyBrandColors,
  CompanyContactSnapshot,
} from "@/lib/company-workspace/brand-center/types";
import { validateBrandCenterIdentity } from "@/lib/company-workspace/company-identity/validate-company-identity";
import { cn } from "@/lib/utils";

type CompanyBrandCenterProps = {
  onNavigateToOverview?: () => void;
};

type SectionId =
  | "general"
  | "logos"
  | "colors"
  | "documents"
  | "email";

const COLOR_KEYS: (keyof CompanyBrandColors)[] = [
  "primary",
  "secondary",
  "accent",
  "success",
  "warning",
  "danger",
  "background",
  "surface",
];

function documentsEqual(a: CompanyBrandCenterDocument, b: CompanyBrandCenterDocument): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function CompanyBrandCenter({ onNavigateToOverview }: CompanyBrandCenterProps = {}) {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { bundle, permissions } = useCompanyWorkspace();
  const companyId = bundle?.companyId ?? null;
  const canEdit = permissions.canBranding;

  const { data, isLoading, isError, error } = useCompanyBrandCenter(companyId, Boolean(companyId));
  const { identity } = useCompanyIdentity(Boolean(companyId));
  const saveMutation = useSaveCompanyBrandCenter(companyId);

  const [draft, setDraft] = useState<CompanyBrandCenterDocument | null>(null);
  /** Last server-confirmed snapshot — dirty must compare against this, not live query cache. */
  const [baseline, setBaseline] = useState<CompanyBrandCenterDocument | null>(null);
  const [section, setSection] = useState<SectionId>("logos");
  const [surface, setSurface] = useState<BrandPreviewSurface>("sidebar");
  const [highlightFocusId, setHighlightFocusId] = useState<string | null>(null);
  const [previewAllOpen, setPreviewAllOpen] = useState(false);

  useEffect(() => {
    if (!data) return;
    // Hydrate once. Never bind draft to live query cache — optimistic updates /
    // refetch / error rollback were resetting edits and clearing dirty (Save stuck).
    setDraft((prev) => prev ?? data);
    setBaseline((prev) => prev ?? data);
  }, [data]);

  useEffect(() => {
    if (section === "email") setSurface("email");
  }, [section]);

  useEffect(() => {
    if (!highlightFocusId) return;
    const timer = window.setTimeout(() => {
      const el = document.querySelector(brandFocusSelector(highlightFocusId));
      if (el instanceof HTMLElement) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.focus?.({ preventScroll: true });
      }
    }, 220);
    const clear = window.setTimeout(() => setHighlightFocusId(null), 2800);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(clear);
    };
  }, [highlightFocusId, section]);

  const navigateHealth = useCallback((target: BrandHealthTarget) => {
    setSection(target.section as SectionId);
    setHighlightFocusId(target.focusId);
    if (target.section === "email") setSurface("email");
    if (target.section === "logos") setSurface("sidebar");
    if (target.section === "colors") setSurface("crm");
  }, []);

  const dirty = useMemo(() => {
    if (!draft || !baseline) return false;
    return !documentsEqual(draft, baseline);
  }, [draft, baseline]);

  const companyContact: CompanyContactSnapshot = useMemo(
    () => ({
      companyName: identity?.name ?? draft?.general.companyName ?? null,
      phone: identity?.contactPhone ?? null,
      email: identity?.contactEmail ?? null,
      website: identity?.website ?? null,
      address: identity?.address ?? null,
    }),
    [identity, draft?.general.companyName],
  );

  function patchGeneral(patch: Partial<CompanyBrandCenterDocument["general"]>) {
    setDraft((prev) =>
      prev ? { ...prev, general: { ...prev.general, ...patch } } : prev,
    );
  }

  function patchColors(key: keyof CompanyBrandColors, value: string) {
    setDraft((prev) =>
      prev ? { ...prev, colors: { ...prev.colors, [key]: value } } : prev,
    );
  }

  function patchDocuments(patch: Partial<CompanyBrandCenterDocument["documents"]>) {
    setDraft((prev) =>
      prev ? { ...prev, documents: { ...prev.documents, ...patch } } : prev,
    );
  }

  function patchEmail(patch: Partial<CompanyBrandCenterDocument["email"]>) {
    setDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        email: {
          ...prev.email,
          ...patch,
          social: patch.social
            ? { ...prev.email.social, ...patch.social }
            : prev.email.social,
        },
      };
    });
  }

  function setLogo(slot: BrandLogoSlot, url: string | null) {
    setDraft((prev) =>
      prev ? { ...prev, logos: { ...prev.logos, [slot]: url } } : prev,
    );
  }

  async function handleSave() {
    if (!draft || !canEdit || !dirty) return;
    const issues = validateBrandCenterIdentity(draft);
    if (issues.length > 0) {
      toast({
        variant: "destructive",
        title: t("companyWorkspace.brandCenter.validation.title"),
        description: t(`companyWorkspace.brandCenter.validation.${issues[0]!.messageKey}`),
      });
      return;
    }
    try {
      const saved = await saveMutation.mutateAsync(draft);
      setBaseline(saved);
      setDraft(saved);
      if (companyId) {
        void queryClient.invalidateQueries({
          queryKey: ["company-brand-last-updated", companyId],
        });
      }
      toast({
        title: t("companyWorkspace.brandCenter.toasts.savedTitle"),
        description: t("companyWorkspace.brandCenter.toasts.savedDescription"),
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t("companyWorkspace.brandCenter.toasts.errorDescription");
      console.error("[BrandCenter] save failed:", err);
      toast({
        variant: "destructive",
        title: t("companyWorkspace.brandCenter.toasts.errorTitle"),
        description: message,
      });
    }
  }

  if (isLoading || !draft) {
    return (
      <div className="flex min-h-[240px] items-center justify-center rounded-2xl border border-border/60 bg-card">
        <Loader2 className="size-5 animate-spin text-primary" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-card p-4 text-sm text-destructive">
        {error instanceof Error ? error.message : t("companyWorkspace.brandCenter.loadFailed")}
      </div>
    );
  }

  const sections: { id: SectionId; label: string }[] = [
    { id: "general", label: t("companyWorkspace.brandCenter.sections.general") },
    { id: "logos", label: t("companyWorkspace.brandCenter.sections.logos") },
    { id: "colors", label: t("companyWorkspace.brandCenter.sections.colors") },
    { id: "documents", label: t("companyWorkspace.brandCenter.sections.documents") },
    { id: "email", label: t("companyWorkspace.brandCenter.sections.email") },
  ];

  const fieldDisabled = !canEdit || saveMutation.isPending;

  return (
    <div className="space-y-4">
      <header className="sticky top-0 z-20 -mx-1 border-b border-border/50 bg-background/95 px-1 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-base font-semibold tracking-tight">
              {t("companyWorkspace.brandCenter.title")}
            </h1>
            <p className="text-xs text-muted-foreground">
              {canEdit
                ? t("companyWorkspace.brandCenter.subtitle")
                : t("companyWorkspace.brandCenter.readOnly")}
            </p>
          </div>
          {canEdit ? (
            <Button
              type="button"
              size="sm"
              className="h-9"
              disabled={!dirty || saveMutation.isPending}
              onClick={() => void handleSave()}
            >
              {saveMutation.isPending ? (
                <Loader2 className="me-1.5 size-3.5 animate-spin" />
              ) : (
                <Save className="me-1.5 size-3.5" />
              )}
              {t("companyWorkspace.brandCenter.save")}
            </Button>
          ) : null}
        </div>

        <nav className="mt-3 flex flex-wrap gap-1.5">
          {sections.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSection(item.id)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                section === item.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/80 text-muted-foreground hover:bg-muted",
              )}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>

      {section === "email" && companyId ? (
        <EmailIdentityStudio
          draft={draft}
          contact={companyContact}
          disabled={fieldDisabled}
          highlightFocusId={highlightFocusId}
          onPatchEmail={patchEmail}
          onChangeLogo={() => {
            setSection("logos");
            setSurface("email");
            setHighlightFocusId("logo-email");
          }}
          onEditCompany={() => onNavigateToOverview?.()}
        />
      ) : section === "email" ? (
        <div className="rounded-2xl border border-border/60 bg-card p-6 text-sm text-muted-foreground">
          {t("companyWorkspace.empty")}
        </div>
      ) : (
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.9fr)]">
        <div className="space-y-4">
          {section === "general" ? (
            <section className="space-y-4 rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
              <h2 className="text-sm font-semibold">
                {t("companyWorkspace.brandCenter.sections.general")}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label={t("companyWorkspace.brandCenter.companyName")}
                  value={draft.general.companyName}
                  disabled={fieldDisabled}
                  onChange={(v) => patchGeneral({ companyName: v })}
                />
                <Field
                  label={t("companyWorkspace.brandCenter.legalName")}
                  value={draft.general.legalName}
                  disabled={fieldDisabled}
                  onChange={(v) => patchGeneral({ legalName: v })}
                />
                <Field
                  label={t("companyWorkspace.brandCenter.shortName")}
                  value={draft.general.shortName}
                  disabled={fieldDisabled}
                  onChange={(v) => patchGeneral({ shortName: v })}
                />
                <Field
                  label={t("companyWorkspace.brandCenter.website")}
                  value={draft.general.website}
                  disabled={fieldDisabled}
                  type="url"
                  onChange={(v) => patchGeneral({ website: v })}
                />
                <Field
                  label={t("companyWorkspace.brandCenter.supportEmail")}
                  value={draft.general.supportEmail}
                  disabled={fieldDisabled}
                  type="email"
                  onChange={(v) => patchGeneral({ supportEmail: v })}
                />
                <Field
                  label={t("companyWorkspace.brandCenter.supportPhone")}
                  value={draft.general.supportPhone}
                  disabled={fieldDisabled}
                  type="tel"
                  onChange={(v) => patchGeneral({ supportPhone: v })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("companyWorkspace.brandCenter.description")}</Label>
                <Textarea
                  value={draft.general.description}
                  disabled={fieldDisabled}
                  rows={3}
                  onChange={(e) => patchGeneral({ description: e.target.value })}
                />
              </div>
            </section>
          ) : null}

          {section === "logos" && companyId ? (
            <>
              <BrandAssetsPanel
                companyId={companyId}
                logos={draft.logos}
                readOnly={!canEdit}
                highlightFocusId={highlightFocusId}
                onSetLogo={setLogo}
              />
              <BrandHealthCard document={draft} onNavigate={navigateHealth} />
              <BrandUsagePanel
                document={draft}
                activeSurface={surface}
                onSelect={setSurface}
                onPreviewAll={() => setPreviewAllOpen(true)}
              />
              <BrandLastUpdatedCard companyId={companyId} />
            </>
          ) : null}

          {section === "colors" ? (
            <section className="space-y-4 rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
              <h2 className="text-sm font-semibold">
                {t("companyWorkspace.brandCenter.sections.colors")}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {COLOR_KEYS.map((key) => (
                  <div
                    key={key}
                    data-brand-focus={`color-${key}`}
                    className={cn(
                      "space-y-1.5 rounded-xl p-1 transition-shadow",
                      highlightFocusId === `color-${key}` &&
                        "ring-2 ring-primary ring-offset-2 ring-offset-background",
                    )}
                  >
                    <Label>{t(`companyWorkspace.brandCenter.color${capitalize(key)}`)}</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={normalizeHexForPicker(draft.colors[key])}
                        disabled={fieldDisabled}
                        onChange={(e) => patchColors(key, e.target.value.toUpperCase())}
                        className="size-10 cursor-pointer rounded-lg border border-border/60 bg-transparent p-0.5 disabled:cursor-not-allowed"
                      />
                      <Input
                        value={draft.colors[key]}
                        disabled={fieldDisabled}
                        dir="ltr"
                        className="font-mono text-sm uppercase"
                        onChange={(e) => patchColors(key, e.target.value)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {section === "documents" && companyId ? (
            <section className="space-y-4 rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
              <h2 className="text-sm font-semibold">
                {t("companyWorkspace.brandCenter.sections.documents")}
              </h2>
              <div className="space-y-1.5">
                <Label>{t("companyWorkspace.brandCenter.invoiceFooter")}</Label>
                <Textarea
                  value={draft.documents.invoiceFooter}
                  disabled={fieldDisabled}
                  rows={3}
                  onChange={(e) => patchDocuments({ invoiceFooter: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("companyWorkspace.brandCenter.quotationFooter")}</Label>
                <Textarea
                  value={draft.documents.quotationFooter}
                  disabled={fieldDisabled}
                  rows={3}
                  onChange={(e) => patchDocuments({ quotationFooter: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("companyWorkspace.brandCenter.terms")}</Label>
                <Textarea
                  value={draft.documents.terms}
                  disabled={fieldDisabled}
                  rows={4}
                  onChange={(e) => patchDocuments({ terms: e.target.value })}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <BrandAssetUploadCard
                  companyId={companyId}
                  slot="watermark"
                  label={t("companyWorkspace.brandCenter.watermark")}
                  url={draft.documents.watermarkUrl}
                  readOnly={!canEdit}
                  onUploaded={(url) => patchDocuments({ watermarkUrl: url })}
                  onDeleted={() => patchDocuments({ watermarkUrl: null })}
                />
                <BrandAssetUploadCard
                  companyId={companyId}
                  slot="signature"
                  label={t("companyWorkspace.brandCenter.signature")}
                  url={draft.documents.signatureUrl}
                  readOnly={!canEdit}
                  onUploaded={(url) => patchDocuments({ signatureUrl: url })}
                  onDeleted={() => patchDocuments({ signatureUrl: null })}
                />
              </div>
            </section>
          ) : null}

        </div>

        <BrandLivePreview
          document={draft ?? createDefaultBrandDocument()}
          surface={surface}
          onSurfaceChange={setSurface}
          onNavigateHealth={navigateHealth}
          companyContact={companyContact}
        />
      </div>
      )}

      <BrandPreviewAllDrawer
        open={previewAllOpen}
        onOpenChange={setPreviewAllOpen}
        document={draft}
        contact={companyContact}
      />
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        type={type}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function normalizeHexForPicker(value: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value;
  if (/^#[0-9a-fA-F]{3}$/.test(value)) {
    const [, a, b, c] = value;
    return `#${a}${a}${b}${b}${c}${c}`;
  }
  return DEFAULT_BRAND_COLORS.primary;
}
