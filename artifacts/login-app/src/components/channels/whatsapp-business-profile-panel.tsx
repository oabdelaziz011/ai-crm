import { useEffect, useMemo, useRef, useState } from "react";
import { Building2, ImagePlus, Loader2, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
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
import { DashboardCard } from "@/components/dashboard/ui";
import { useToast } from "@/hooks/use-toast";
import {
  useSyncWhatsAppBusinessProfile,
  useUpdateWhatsAppBusinessProfile,
  useUploadWhatsAppBusinessProfilePicture,
  useWhatsAppBusinessProfile,
} from "@/hooks/notifications/use-whatsapp-business-profile";
import {
  WHATSAPP_BUSINESS_PROFILE_VERTICAL_OPTIONS,
  isWhatsAppBusinessProfileApiConfigured,
  type WhatsAppBusinessProfile,
} from "@/lib/channels/whatsapp-business-profile-client";
import {
  WA_BP_ABOUT_MAX,
  WA_BP_ADDRESS_MAX,
  WA_BP_DESCRIPTION_MAX,
  WA_BP_EMAIL_MAX,
  WA_BP_WEBSITE_MAX,
  draftWebsites,
  draftsEqual,
  profileToDraft,
  validateBusinessProfileDraft,
  validateProfilePictureFileMeta,
  type WhatsAppBusinessProfileDraft,
  type WhatsAppBusinessProfileFieldErrors,
} from "@/lib/channels/whatsapp-business-profile-form";

export type WhatsAppBusinessProfilePanelProps = {
  companyId: string;
  hasConnection: boolean;
  /** Persisted company Phone Number ID (display/verify only — never sent as mutation authority). */
  phoneNumberId?: string | null;
  displayPhoneNumber?: string | null;
};

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Failed to read image file"));
    reader.readAsDataURL(file);
  });
}

function readImageDimensionsFromFile(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const width = img.naturalWidth;
      const height = img.naturalHeight;
      URL.revokeObjectURL(url);
      resolve({ width, height });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Invalid image file"));
    };
    img.src = url;
  });
}

function formatSyncedAt(value: string | null | undefined, locale: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function mapProfileErrorCode(code: string | undefined, fallback: string, t: (key: string) => string): string {
  switch (code) {
    case "BP_NOT_CONNECTED":
      return t("notifications.whatsapp.settings.businessProfile.errors.notConnected");
    case "BP_PHONE_NUMBER_ID_MISSING":
      return t("notifications.whatsapp.settings.businessProfile.errors.phoneMissing");
    case "BP_TOKEN_INVALID":
    case "BP_TOKEN_MISSING":
      return t("notifications.whatsapp.settings.businessProfile.errors.tokenInvalid");
    case "BP_RATE_LIMITED":
      return t("notifications.whatsapp.settings.businessProfile.errors.rateLimited");
    case "BP_IMAGE_UNSUPPORTED":
      return t("notifications.whatsapp.settings.businessProfile.errors.imageUnsupported");
    case "BP_IMAGE_TOO_LARGE":
      return t("notifications.whatsapp.settings.businessProfile.errors.imageTooLarge");
    case "BP_IMAGE_DIMENSIONS":
    case "BP_IMAGE_NOT_SQUARE":
    case "BP_IMAGE_INVALID":
      return t("notifications.whatsapp.settings.businessProfile.errors.imageInvalid");
    case "BP_NETWORK":
      return t("notifications.whatsapp.settings.businessProfile.errors.network");
    case "BP_UPLOAD_SESSION_FAILED":
    case "BP_UPLOAD_FAILED":
    case "BP_PICTURE_UPDATE_FAILED":
      return t("notifications.whatsapp.settings.businessProfile.errors.pictureFailed");
    case "BP_UPDATE_FAILED":
    case "BP_VALIDATION":
      return t("notifications.whatsapp.settings.businessProfile.errors.updateFailed");
    case "BP_UNSUPPORTED_MODE":
      return t("notifications.whatsapp.settings.businessProfile.errors.unsupportedMode");
    case "forbidden":
      return t("notifications.whatsapp.settings.businessProfile.errors.forbidden");
    default:
      return fallback;
  }
}

function fieldErrorMessage(
  key: string | undefined,
  t: (key: string) => string,
): string | null {
  if (!key) return null;
  return t(`notifications.whatsapp.settings.businessProfile.validation.${key}`);
}

export function WhatsAppBusinessProfilePanel({
  companyId,
  hasConnection,
  phoneNumberId,
  displayPhoneNumber,
}: WhatsAppBusinessProfilePanelProps) {
  const { t, i18n } = useTranslation("common");
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const profileQuery = useWhatsAppBusinessProfile(companyId, {
    enabled: hasConnection && isWhatsAppBusinessProfileApiConfigured(),
  });
  const syncMutation = useSyncWhatsAppBusinessProfile(companyId);
  const updateMutation = useUpdateWhatsAppBusinessProfile(companyId);
  const pictureMutation = useUploadWhatsAppBusinessProfilePicture(companyId);

  const [draft, setDraft] = useState<WhatsAppBusinessProfileDraft | null>(null);
  const [baseline, setBaseline] = useState<WhatsAppBusinessProfileDraft | null>(null);
  const [fieldErrors, setFieldErrors] = useState<WhatsAppBusinessProfileFieldErrors>({});
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const profile = profileQuery.data ?? null;

  const applyProfile = (next: WhatsAppBusinessProfile) => {
    const nextDraft = profileToDraft(next);
    setDraft(nextDraft);
    setBaseline(nextDraft);
    setFieldErrors({});
    setPendingFile(null);
    setPreviewUrl(null);
    setLocalError(null);
  };

  useEffect(() => {
    if (!profile) return;
    // Hydrate only when there are no unsaved edits (including pending picture).
    if (draft && baseline && (!draftsEqual(draft, baseline) || pendingFile)) return;
    applyProfile(profile);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional hydrate guard
  }, [profile]);

  const dirty = useMemo(() => {
    if (!draft || !baseline) return false;
    return !draftsEqual(draft, baseline) || pendingFile != null;
  }, [draft, baseline, pendingFile]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    return () => {
      if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const queryErrorMessage = useMemo(() => {
    if (!profileQuery.error) return null;
    const err = profileQuery.error as Error & { code?: string };
    return mapProfileErrorCode(err.code, err.message || String(err), t);
  }, [profileQuery.error, t]);

  const error = localError ?? queryErrorMessage;

  const busy =
    profileQuery.isFetching ||
    syncMutation.isPending ||
    updateMutation.isPending ||
    pictureMutation.isPending;

  const scopedPhoneNumberId =
    profile?.phoneNumberId?.trim() || (phoneNumberId ?? "").trim() || "—";
  const scopedDisplayPhone =
    profile?.displayPhoneNumber?.trim() ||
    (displayPhoneNumber ?? "").trim() ||
    "—";

  const onLoadProfile = async () => {
    if (dirty && !window.confirm(t("notifications.whatsapp.settings.businessProfile.discardConfirm"))) {
      return;
    }
    setLocalError(null);
    const result = await profileQuery.refetch();
    if (result.error) {
      const err = result.error as Error & { code?: string };
      setLocalError(mapProfileErrorCode(err.code, err.message || String(err), t));
      return;
    }
    if (result.data) applyProfile(result.data);
  };

  const onSync = async () => {
    if (dirty && !window.confirm(t("notifications.whatsapp.settings.businessProfile.discardConfirm"))) {
      return;
    }
    setLocalError(null);
    try {
      const next = await syncMutation.mutateAsync();
      applyProfile(next);
      toast({ title: t("notifications.whatsapp.settings.businessProfile.syncSuccess") });
    } catch (err) {
      const code = (err as Error & { code?: string })?.code;
      const message = mapProfileErrorCode(
        code,
        err instanceof Error ? err.message : String(err),
        t,
      );
      setLocalError(message);
      toast({
        title: t("notifications.whatsapp.settings.businessProfile.syncFailed"),
        description: message,
        variant: "destructive",
      });
    }
  };

  const onSaveFields = async () => {
    if (!draft || updateMutation.isPending || pendingFile) return;
    const nextErrors = validateBusinessProfileDraft(draft);
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setLocalError(t("notifications.whatsapp.settings.businessProfile.validation.formInvalid"));
      return;
    }
    setLocalError(null);
    try {
      const next = await updateMutation.mutateAsync({
        about: draft.about.trim(),
        address: draft.address.trim(),
        description: draft.description.trim(),
        email: draft.email.trim(),
        websites: draftWebsites(draft),
        vertical: draft.vertical,
      });
      applyProfile(next);
      toast({ title: t("notifications.whatsapp.settings.businessProfile.saveSuccess") });
    } catch (err) {
      const code = (err as Error & { code?: string })?.code;
      const message = mapProfileErrorCode(
        code,
        err instanceof Error ? err.message : String(err),
        t,
      );
      setLocalError(message);
      toast({
        title: t("notifications.whatsapp.settings.businessProfile.saveFailed"),
        description: message,
        variant: "destructive",
      });
    }
  };

  const onPickPicture = async (file: File | null) => {
    if (!file) return;
    try {
      const dims = await readImageDimensionsFromFile(file);
      const code = validateProfilePictureFileMeta({
        mimeType: file.type,
        sizeBytes: file.size,
        width: dims.width,
        height: dims.height,
      });
      if (code) {
        toast({
          title: t(`notifications.whatsapp.settings.businessProfile.errors.${code}`),
          variant: "destructive",
        });
        return;
      }
    } catch {
      toast({
        title: t("notifications.whatsapp.settings.businessProfile.errors.imageInvalid"),
        variant: "destructive",
      });
      return;
    }
    if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    setPendingFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const onUploadPicture = async () => {
    if (!pendingFile || pictureMutation.isPending) return;
    setLocalError(null);
    try {
      const dataUrl = await readFileAsDataUrl(pendingFile);
      const next = await pictureMutation.mutateAsync({
        mimeType: pendingFile.type,
        imageBase64: dataUrl,
        fileName: pendingFile.name,
      });
      applyProfile(next);
      toast({ title: t("notifications.whatsapp.settings.businessProfile.pictureSuccess") });
    } catch (err) {
      const code = (err as Error & { code?: string })?.code;
      const message = mapProfileErrorCode(
        code,
        err instanceof Error ? err.message : String(err),
        t,
      );
      setLocalError(message);
      toast({
        title: t("notifications.whatsapp.settings.businessProfile.pictureFailed"),
        description: message,
        variant: "destructive",
      });
    }
  };

  if (!isWhatsAppBusinessProfileApiConfigured()) {
    return (
      <DashboardCard className="p-6 space-y-2" data-testid="wa-bp-panel">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-primary" />
          <h3 className="font-semibold">{t("notifications.whatsapp.settings.businessProfile.title")}</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          {t("notifications.whatsapp.settings.businessProfile.apiMissing")}
        </p>
      </DashboardCard>
    );
  }

  if (!hasConnection) {
    // Keep the Business Profile surface visible (incl. picture upload affordance) so local/WIP
    // work is discoverable before Meta connection. Actions stay disabled until connected.
    return (
      <DashboardCard className="p-6 space-y-5" data-testid="wa-bp-panel">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-primary" />
            <h3 className="font-semibold">{t("notifications.whatsapp.settings.businessProfile.title")}</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            {t("notifications.whatsapp.settings.businessProfile.description")}
          </p>
        </div>
        <div
          className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100"
          role="status"
        >
          {t("notifications.whatsapp.settings.businessProfile.notConnectedHint")}
        </div>
        <div
          className="rounded-xl border border-[#25D366]/35 bg-[#ECE5DD] p-4 dark:bg-[#1f2c24]"
          data-testid="wa-bp-preview-card-disconnected"
          aria-label={t("notifications.whatsapp.settings.businessProfile.previewLabel")}
        >
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t("notifications.whatsapp.settings.businessProfile.previewLabel")}
          </p>
          <div className="flex items-start gap-3 rounded-lg bg-white/90 p-3 shadow-sm dark:bg-black/20">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted text-[10px] text-muted-foreground">
              WA
            </div>
            <div className="min-w-0 flex-1 space-y-1 text-sm">
              <p className="font-semibold text-foreground">WhatsApp Business</p>
              <p className="text-xs text-muted-foreground">—</p>
            </div>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-[160px_1fr] items-start opacity-70">
          <div className="space-y-2">
            <Label>{t("notifications.whatsapp.settings.businessProfile.currentPicture")}</Label>
            <div className="flex h-36 w-36 items-center justify-center overflow-hidden rounded-md border bg-muted/40 px-2 text-center text-xs text-muted-foreground">
              {t("notifications.whatsapp.settings.businessProfile.noPicture")}
            </div>
          </div>
          <div className="space-y-3">
            <Label>{t("notifications.whatsapp.settings.businessProfile.newPicture")}</Label>
            <div className="flex h-36 w-36 items-center justify-center overflow-hidden rounded-md border bg-muted/40 px-2 text-center text-xs text-muted-foreground">
              {t("notifications.whatsapp.settings.businessProfile.previewEmpty")}
            </div>
            <Button type="button" variant="outline" size="sm" disabled>
              <ImagePlus className="w-4 h-4" />
              <span className="ms-2">
                {t("notifications.whatsapp.settings.businessProfile.uploadPicture")}
              </span>
            </Button>
            <p className="text-xs text-muted-foreground">
              {t("notifications.whatsapp.settings.businessProfile.pictureHint")}
            </p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 opacity-70">
          <div className="space-y-2 sm:col-span-2">
            <Label>{t("notifications.whatsapp.settings.businessProfile.about")}</Label>
            <Textarea disabled value="" placeholder="—" />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>{t("notifications.whatsapp.settings.businessProfile.descriptionField")}</Label>
            <Textarea disabled value="" placeholder="—" />
          </div>
          <div className="space-y-2">
            <Label>{t("notifications.whatsapp.settings.businessProfile.address")}</Label>
            <Input disabled value="" placeholder="—" />
          </div>
          <div className="space-y-2">
            <Label>{t("notifications.whatsapp.settings.businessProfile.email")}</Label>
            <Input disabled value="" placeholder="—" />
          </div>
        </div>
      </DashboardCard>
    );
  }

  return (
    <DashboardCard className="p-6 space-y-5" data-testid="wa-bp-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-primary" />
            <h3 className="font-semibold">{t("notifications.whatsapp.settings.businessProfile.title")}</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            {t("notifications.whatsapp.settings.businessProfile.description")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void onLoadProfile()}
          >
            {profileQuery.isFetching && !syncMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            <span className="ms-2">{t("notifications.whatsapp.settings.businessProfile.load")}</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void onSync()}
          >
            {syncMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            <span className="ms-2">{t("notifications.whatsapp.settings.businessProfile.sync")}</span>
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {t("notifications.whatsapp.settings.businessProfile.displayNameNote")}
      </p>
      <p className="text-xs text-muted-foreground rounded-md border border-border/70 bg-muted/30 px-3 py-2">
        {t("notifications.whatsapp.settings.businessProfile.coexistenceNote")}
      </p>

      <div
        className="space-y-2 rounded-md border border-border/70 bg-muted/20 px-3 py-3"
        data-testid="wa-bp-oba-status"
      >
        <p className="text-sm font-medium">
          {t("notifications.whatsapp.settings.businessProfile.officialBadge")}
        </p>
        <p className="text-xs text-muted-foreground">
          {t("notifications.whatsapp.settings.businessProfile.officialBadgeNote")}
        </p>
        <ul className="space-y-1 text-sm">
          <li data-testid="wa-bp-oba-flag">
            {profile?.isOfficialBusinessAccount
              ? t("notifications.whatsapp.settings.businessProfile.officialYes")
              : t("notifications.whatsapp.settings.businessProfile.officialNo")}
          </li>
          <li data-testid="wa-bp-pin-flag">
            {profile?.isPinEnabled
              ? t("notifications.whatsapp.settings.businessProfile.pinEnabled")
              : t("notifications.whatsapp.settings.businessProfile.pinDisabled")}
          </li>
          <li data-testid="wa-bp-name-status">
            {t("notifications.whatsapp.settings.businessProfile.nameStatusLabel")}:{" "}
            <span dir="ltr">{profile?.nameStatus?.trim() || "—"}</span>
          </li>
        </ul>
        <div className="space-y-1 pt-1">
          <p className="text-xs font-medium">
            {t("notifications.whatsapp.settings.businessProfile.obaGuideTitle")}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("notifications.whatsapp.settings.businessProfile.obaGuideSteps")}
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1 text-sm">
          <p className="text-muted-foreground">{t("notifications.whatsapp.settings.businessProfile.phone")}</p>
          <p className="font-medium" data-testid="wa-bp-phone" dir="ltr">
            {scopedDisplayPhone}
          </p>
          <p className="text-xs text-muted-foreground" data-testid="wa-bp-phone-number-id">
            {t("notifications.whatsapp.settings.businessProfile.phoneNumberId")}:{" "}
            <span dir="ltr">{scopedPhoneNumberId}</span>
          </p>
        </div>
        <div className="space-y-1 text-sm">
          <p className="text-muted-foreground">{t("notifications.whatsapp.settings.businessProfile.companyScope")}</p>
          <p className="font-medium break-all" data-testid="wa-bp-company-id" dir="ltr">
            {companyId}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("notifications.whatsapp.settings.businessProfile.lastSynced")}:{" "}
            {formatSyncedAt(profile?.syncedAt, i18n.language)}
          </p>
        </div>
      </div>

      {profileQuery.isLoading && !profile ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Loader2 className="w-4 h-4 animate-spin" />
          {t("notifications.whatsapp.settings.businessProfile.loading")}
        </div>
      ) : null}

      {error ? (
        <div
          className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      {profile && draft ? (
        <>
          <div className="space-y-1 text-sm">
            <p className="text-muted-foreground">
              {t("notifications.whatsapp.settings.businessProfile.verifiedName")}
            </p>
            <p className="font-medium">{profile.verifiedName?.trim() || "—"}</p>
          </div>

          {/* Illustrative WhatsApp-style card — not a live WhatsApp view. */}
          <div
            className="rounded-xl border border-[#25D366]/35 bg-[#ECE5DD] p-4 dark:bg-[#1f2c24]"
            data-testid="wa-bp-preview-card"
            aria-label={t("notifications.whatsapp.settings.businessProfile.previewLabel")}
          >
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t("notifications.whatsapp.settings.businessProfile.previewLabel")}
            </p>
            <div className="flex items-start gap-3 rounded-lg bg-white/90 p-3 shadow-sm dark:bg-black/20">
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full border bg-muted">
                {previewUrl || profile.profilePictureUrl ? (
                  <img
                    src={previewUrl || profile.profilePictureUrl || ""}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground">
                    WA
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-1 text-sm">
                <p className="truncate font-semibold text-foreground">
                  {profile.verifiedName?.trim() ||
                    profile.displayPhoneNumber?.trim() ||
                    "WhatsApp Business"}
                </p>
                <p className="line-clamp-2 text-xs text-muted-foreground">
                  {draft.about.trim() || "—"}
                </p>
                <p className="line-clamp-2 text-xs text-foreground/80">
                  {draft.description.trim() || "—"}
                </p>
                {draftWebsites(draft).length ? (
                  <p className="truncate text-[11px] text-[#128C7E]">
                    {draftWebsites(draft).join(" · ")}
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-[160px_1fr] items-start">
            <div className="space-y-2">
              <Label>{t("notifications.whatsapp.settings.businessProfile.currentPicture")}</Label>
              <div className="h-36 w-36 overflow-hidden rounded-md border bg-muted/40">
                {profile.profilePictureUrl ? (
                  <img
                    src={profile.profilePictureUrl}
                    alt={t("notifications.whatsapp.settings.businessProfile.currentPicture")}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-muted-foreground px-2 text-center">
                    {t("notifications.whatsapp.settings.businessProfile.noPicture")}
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-3">
              <Label>{t("notifications.whatsapp.settings.businessProfile.newPicture")}</Label>
              <div className="h-36 w-36 overflow-hidden rounded-md border bg-muted/40">
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt={t("notifications.whatsapp.settings.businessProfile.newPicture")}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-muted-foreground px-2 text-center">
                    {t("notifications.whatsapp.settings.businessProfile.previewEmpty")}
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/jpg"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  void onPickPicture(file);
                  event.target.value = "";
                }}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <ImagePlus className="w-4 h-4" />
                  <span className="ms-2">
                    {t("notifications.whatsapp.settings.businessProfile.uploadPicture")}
                  </span>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={busy || !pendingFile}
                  onClick={() => void onUploadPicture()}
                >
                  {pictureMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  <span className="ms-2">
                    {t("notifications.whatsapp.settings.businessProfile.applyPicture")}
                  </span>
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("notifications.whatsapp.settings.businessProfile.pictureHint")}
              </p>
              {pictureMutation.isPending ? (
                <p className="text-xs text-muted-foreground" role="status">
                  {t("notifications.whatsapp.settings.businessProfile.uploadProgress")}
                </p>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="wa-bp-about">{t("notifications.whatsapp.settings.businessProfile.about")}</Label>
              <Textarea
                id="wa-bp-about"
                value={draft.about}
                maxLength={WA_BP_ABOUT_MAX}
                disabled={busy}
                aria-invalid={Boolean(fieldErrors.about)}
                onChange={(event) =>
                  setDraft((prev) => (prev ? { ...prev, about: event.target.value } : prev))
                }
              />
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="tabular-nums ms-auto" dir="ltr">
                  {draft.about.trim().length}/{WA_BP_ABOUT_MAX}
                </span>
                {fieldErrors.about ? (
                  <span className="text-destructive basis-full text-start" role="alert">
                    {fieldErrorMessage(fieldErrors.about, t)}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="wa-bp-description">
                {t("notifications.whatsapp.settings.businessProfile.descriptionField")}
              </Label>
              <Textarea
                id="wa-bp-description"
                value={draft.description}
                maxLength={WA_BP_DESCRIPTION_MAX}
                disabled={busy}
                onChange={(event) =>
                  setDraft((prev) => (prev ? { ...prev, description: event.target.value } : prev))
                }
              />
              <p className="text-xs text-muted-foreground tabular-nums text-end" dir="ltr">
                {draft.description.trim().length}/{WA_BP_DESCRIPTION_MAX}
              </p>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="wa-bp-address">{t("notifications.whatsapp.settings.businessProfile.address")}</Label>
              <Input
                id="wa-bp-address"
                value={draft.address}
                maxLength={WA_BP_ADDRESS_MAX}
                disabled={busy}
                onChange={(event) =>
                  setDraft((prev) => (prev ? { ...prev, address: event.target.value } : prev))
                }
              />
              <p className="text-xs text-muted-foreground tabular-nums text-end" dir="ltr">
                {draft.address.trim().length}/{WA_BP_ADDRESS_MAX}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="wa-bp-email">{t("notifications.whatsapp.settings.businessProfile.email")}</Label>
              <Input
                id="wa-bp-email"
                type="email"
                value={draft.email}
                maxLength={WA_BP_EMAIL_MAX}
                disabled={busy}
                dir="ltr"
                className="text-start"
                aria-invalid={Boolean(fieldErrors.email)}
                onChange={(event) =>
                  setDraft((prev) => (prev ? { ...prev, email: event.target.value } : prev))
                }
              />
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="tabular-nums ms-auto" dir="ltr">
                  {draft.email.trim().length}/{WA_BP_EMAIL_MAX}
                </span>
                {fieldErrors.email ? (
                  <span className="text-destructive basis-full text-start" role="alert">
                    {fieldErrorMessage(fieldErrors.email, t)}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("notifications.whatsapp.settings.businessProfile.vertical")}</Label>
              <Select
                value={draft.vertical || "OTHER"}
                disabled={busy}
                onValueChange={(value) =>
                  setDraft((prev) => (prev ? { ...prev, vertical: value } : prev))
                }
              >
                <SelectTrigger aria-invalid={Boolean(fieldErrors.vertical)}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WHATSAPP_BUSINESS_PROFILE_VERTICAL_OPTIONS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {t(`notifications.whatsapp.settings.businessProfile.verticals.${value}`, {
                        defaultValue: value,
                      })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldErrors.vertical ? (
                <p className="text-xs text-destructive" role="alert">
                  {fieldErrorMessage(fieldErrors.vertical, t)}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="wa-bp-website1">
                {t("notifications.whatsapp.settings.businessProfile.website1")}
              </Label>
              <Input
                id="wa-bp-website1"
                value={draft.website1}
                maxLength={WA_BP_WEBSITE_MAX}
                disabled={busy}
                placeholder="https://"
                dir="ltr"
                className="text-start"
                aria-invalid={Boolean(fieldErrors.website1)}
                onChange={(event) =>
                  setDraft((prev) => (prev ? { ...prev, website1: event.target.value } : prev))
                }
              />
              {fieldErrors.website1 ? (
                <p className="text-xs text-destructive" role="alert">
                  {fieldErrorMessage(fieldErrors.website1, t)}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              {draft.showWebsite2 ? (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="wa-bp-website2">
                      {t("notifications.whatsapp.settings.businessProfile.website2")}
                    </Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        setDraft((prev) =>
                          prev
                            ? { ...prev, showWebsite2: false, website2: "" }
                            : prev,
                        )
                      }
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span className="ms-1">
                        {t("notifications.whatsapp.settings.businessProfile.removeWebsite")}
                      </span>
                    </Button>
                  </div>
                  <Input
                    id="wa-bp-website2"
                    value={draft.website2}
                    maxLength={WA_BP_WEBSITE_MAX}
                    disabled={busy}
                    placeholder="https://"
                    dir="ltr"
                    className="text-start"
                    aria-invalid={Boolean(fieldErrors.website2)}
                    onChange={(event) =>
                      setDraft((prev) => (prev ? { ...prev, website2: event.target.value } : prev))
                    }
                  />
                  {fieldErrors.website2 ? (
                    <p className="text-xs text-destructive" role="alert">
                      {fieldErrorMessage(fieldErrors.website2, t)}
                    </p>
                  ) : null}
                </>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    setDraft((prev) => (prev ? { ...prev, showWebsite2: true } : prev))
                  }
                >
                  <Plus className="w-4 h-4" />
                  <span className="ms-2">
                    {t("notifications.whatsapp.settings.businessProfile.addWebsite")}
                  </span>
                </Button>
              )}
            </div>
          </div>

          {dirty ? (
            <p className="text-xs text-amber-700 dark:text-amber-400" role="status">
              {t("notifications.whatsapp.settings.businessProfile.unsaved")}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={busy || !dirty || !!pendingFile}
              onClick={() => void onSaveFields()}
            >
              {updateMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span className="ms-2">{t("notifications.whatsapp.settings.businessProfile.save")}</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy || !dirty}
              onClick={() => {
                if (baseline) setDraft(baseline);
                if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
                setPendingFile(null);
                setPreviewUrl(null);
                setFieldErrors({});
                setLocalError(null);
              }}
            >
              {t("notifications.whatsapp.settings.businessProfile.cancel")}
            </Button>
          </div>
        </>
      ) : !profileQuery.isLoading ? (
        <p className="text-sm text-muted-foreground" role="status">
          {t("notifications.whatsapp.settings.businessProfile.empty")}
        </p>
      ) : null}
    </DashboardCard>
  );
}
