import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  Building2,
  FileText,
  ImageIcon,
  Loader2,
  Mail,
  MailCheck,
  PenLine,
  UserRound,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { BrandAssetUploadCard } from "@/components/company-workspace/brand-center/brand-asset-upload-card";
import { DashboardCard } from "@/components/dashboard/ui";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  useChannelAdminMutations,
  useCompanyChannelsAdmin,
} from "@/hooks/channels/use-company-channels-admin";
import {
  useCompanyBrandCenter,
  useSaveCompanyEmailIdentity,
} from "@/hooks/company-workspace/use-company-brand-center";
import {
  canManageCompanyEmailIdentity,
  canManageEmailConnection,
  canManagePersonalEmailIdentity,
} from "@/lib/email-workspace/email-identity-permissions";
import {
  useMyEmailIdentity,
  useSaveMyEmailIdentity,
} from "@/hooks/email/use-my-email-identity";
import {
  useEmailSettings,
  useUpdateEmailSettings,
} from "@/hooks/notifications/use-email-health";
import { useToast } from "@/hooks/use-toast";
import { useAuthUser } from "@/hooks/use-rbac";
import {
  createDefaultBrandDocument,
  emptyEmailAcknowledgement,
} from "@/lib/company-workspace/brand-center/defaults";
import { resolveEmailLogoUrl } from "@/lib/company-workspace/brand-center/normalize";
import type {
  CompanyBrandCenterDocument,
  CompanyBrandEmail,
  EmailAcknowledgementConfig,
} from "@/lib/company-workspace/brand-center/types";
import {
  emptyPersonalEmailIdentity,
  resolvePersonalSenderDisplayName,
  resolvePersonalSenderName,
  type PersonalEmailIdentity,
} from "@/lib/email-workspace/email-personal-identity";
import {
  listCompanyEmailSenderOptions,
  resolveSelectedCompanyEmailChannelId,
} from "@/lib/email-workspace/email-compose-new";
import { resolveOutboundFromDisplayName } from "@/lib/email-workspace/email-sender-identity";
import { companyEmailSettingsToDraft } from "@/lib/notifications/providers/email/services/email-settings-repository";
import {
  emptyEmailSignatureColors,
  emptyEmailSignatureConfig,
  isValidSignatureEmail,
  isValidSignatureWebsite,
  normalizeSignatureHexColor,
  renderEmailSignatureHtml,
  type EmailSignatureColors,
  type EmailSignatureConfig,
} from "@workspace/channel-platform";

function valuesEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function FieldHelper({ children }: { children: string }) {
  return (
    <p className="text-xs leading-relaxed text-muted-foreground">{children}</p>
  );
}

function SectionBadge({ step }: { step: string }) {
  return (
    <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
      {step}
    </span>
  );
}

function hexForColorInput(value: string): string {
  const normalized = normalizeSignatureHexColor(value);
  return /^#[0-9A-Fa-f]{6}$/.test(normalized) ? normalized : "#111827";
}

function SignatureFieldColorControl({
  value,
  disabled,
  ariaLabel,
  testId,
  onChange,
}: {
  value: string;
  disabled?: boolean;
  ariaLabel: string;
  testId: string;
  onChange: (hex: string) => void;
}) {
  const [hexDraft, setHexDraft] = useState(value);

  useEffect(() => {
    setHexDraft(value);
  }, [value]);

  const commitHex = (raw: string) => {
    const next = normalizeSignatureHexColor(raw, value);
    setHexDraft(next);
    if (next !== value) onChange(next);
  };

  return (
    <div
      className="flex shrink-0 items-center gap-1.5"
      dir="ltr"
      data-testid={testId}
    >
      <input
        type="color"
        value={hexForColorInput(value)}
        disabled={disabled}
        aria-label={ariaLabel}
        data-testid={`${testId}-picker`}
        className="h-9 w-9 cursor-pointer rounded-md border border-border/60 bg-transparent p-0.5 disabled:cursor-not-allowed"
        onChange={(event) => {
          const next = event.target.value.toUpperCase();
          setHexDraft(next);
          onChange(next);
        }}
      />
      <Input
        value={hexDraft}
        disabled={disabled}
        dir="ltr"
        spellCheck={false}
        aria-label={ariaLabel}
        data-testid={`${testId}-hex`}
        className="h-9 w-[6.5rem] font-mono text-xs uppercase"
        onChange={(event) => {
          const raw = event.target.value;
          setHexDraft(raw);
          if (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(raw.trim())) {
            onChange(normalizeSignatureHexColor(raw.trim()));
          }
        }}
        onBlur={() => commitHex(hexDraft)}
      />
    </div>
  );
}

function SignatureCard({
  step,
  title,
  description,
  signature,
  testId,
  fieldTestIdPrefix,
  previewLogoUrl,
  onPatch,
}: {
  step: string;
  title: string;
  description: string;
  signature: EmailSignatureConfig;
  testId: string;
  fieldTestIdPrefix: string;
  previewLogoUrl?: string | null;
  onPatch: (patch: Partial<EmailSignatureConfig>) => void;
}) {
  const { t } = useTranslation("common");
  const colors = signature.colors ?? emptyEmailSignatureColors();
  const patchColor = (field: keyof EmailSignatureColors, hex: string) => {
    onPatch({ colors: { ...colors, [field]: hex } });
  };
  const fields = [
    { key: "name", inputType: "text" },
    { key: "title", inputType: "text" },
    { key: "email", inputType: "email" },
    { key: "website", inputType: "text" },
  ] as const;

  return (
    <div data-testid={testId}>
      <DashboardCard className="space-y-3 p-5">
        <div className="flex items-start gap-3">
          <SectionBadge step={step} />
          <PenLine className="mt-1 size-4 text-primary" aria-hidden />
          <div className="min-w-0 flex-1 space-y-1">
            <h3 className="text-sm font-semibold">{title}</h3>
            <FieldHelper>{description}</FieldHelper>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {fields.map(({ key, inputType }) => {
            const label = t(
              `emailModule.settingsHub.identity.signature.${key}Label`,
            );
            const inputTestId = `${fieldTestIdPrefix}-${key}`;
            return (
              <div className="space-y-1.5" key={key}>
                <Label htmlFor={inputTestId}>{label}</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id={inputTestId}
                    type={inputType}
                    dir={
                      key === "email" || key === "website" ? "ltr" : undefined
                    }
                    value={signature[key]}
                    placeholder={t(
                      `emailModule.settingsHub.identity.signature.${key}Placeholder`,
                    )}
                    onChange={(event) => onPatch({ [key]: event.target.value })}
                    data-testid={inputTestId}
                    className="min-w-0 flex-1"
                  />
                  <SignatureFieldColorControl
                    value={colors[key]}
                    ariaLabel={t(
                      "emailModule.settingsHub.identity.signature.colorLabel",
                      {
                        field: label,
                      },
                    )}
                    testId={`${inputTestId}-color`}
                    onChange={(hex) => patchColor(key, hex)}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div
          className="rounded-lg border border-border/60 bg-muted/20 p-3"
          data-testid={`${testId}-preview`}
        >
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {t("emailModule.settingsHub.identity.signature.previewLabel")}
          </p>
          {previewLogoUrl ? (
            <img
              src={previewLogoUrl}
              alt=""
              className="mb-2 h-10 max-w-[160px] object-contain"
              data-testid={`${testId}-preview-logo`}
            />
          ) : null}
          {renderEmailSignatureHtml(signature) ? (
            <div
              className="text-[13px] leading-relaxed [&_a]:no-underline"
              dangerouslySetInnerHTML={{
                __html: renderEmailSignatureHtml(signature),
              }}
            />
          ) : (
            <p className="text-xs text-muted-foreground">
              {t("emailModule.settingsHub.identity.signature.previewEmpty")}
            </p>
          )}
        </div>
      </DashboardCard>
    </div>
  );
}

export function EmailSettingsIdentityPanel({
  companyId,
}: {
  companyId: string;
}) {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const canManagePersonal = canManagePersonalEmailIdentity(
    hasPermission,
    isSuperAdmin,
  );
  const canEditCompany = canManageCompanyEmailIdentity(
    hasPermission,
    isSuperAdmin,
  );
  const canConnection = canManageEmailConnection(hasPermission, isSuperAdmin);

  const { data: myIdentity, isLoading: personalLoading } =
    useMyEmailIdentity(canManagePersonal);
  const savePersonal = useSaveMyEmailIdentity();
  const { data: brandDocument, isLoading: brandLoading } =
    useCompanyBrandCenter(companyId, canEditCompany);
  const saveCompany = useSaveCompanyEmailIdentity(
    canEditCompany ? companyId : null,
  );
  const { data: emailSettings, isLoading: settingsLoading } = useEmailSettings(
    canConnection ? companyId : null,
  );
  const updateSettings = useUpdateEmailSettings(
    canConnection ? companyId : null,
  );
  const { data: channels = [], isLoading: channelsLoading } =
    useCompanyChannelsAdmin(canConnection);
  const { setDefault } = useChannelAdminMutations(
    canConnection ? companyId : null,
  );

  const [personalDraft, setPersonalDraft] =
    useState<PersonalEmailIdentity | null>(null);
  const [personalBaseline, setPersonalBaseline] =
    useState<PersonalEmailIdentity | null>(null);
  const [jobTitleDraft, setJobTitleDraft] = useState("");
  const [jobTitleBaseline, setJobTitleBaseline] = useState("");
  const [brandDraft, setBrandDraft] =
    useState<CompanyBrandCenterDocument | null>(null);
  const [brandBaseline, setBrandBaseline] =
    useState<CompanyBrandCenterDocument | null>(null);

  useEffect(() => {
    if (!myIdentity || personalDraft) return;
    const personal: PersonalEmailIdentity = {
      ...emptyPersonalEmailIdentity(),
      ...myIdentity.personal,
      senderName: resolvePersonalSenderName({
        personal: myIdentity.personal,
        profileFullName: myIdentity.profileFullName,
      }),
      senderDisplayName: resolvePersonalSenderDisplayName({
        personal: myIdentity.personal,
        profileFullName: myIdentity.profileFullName,
      }),
      signature: {
        ...emptyEmailSignatureConfig(),
        ...myIdentity.personal.signature,
        colors: {
          ...emptyEmailSignatureColors(),
          ...myIdentity.personal.signature.colors,
        },
      },
    };
    setPersonalDraft(personal);
    setPersonalBaseline(personal);
    setJobTitleDraft(myIdentity.profileJobTitle);
    setJobTitleBaseline(myIdentity.profileJobTitle);
  }, [myIdentity, personalDraft]);

  useEffect(() => {
    if (!brandDocument || brandDraft) return;
    setBrandDraft(brandDocument);
    setBrandBaseline(brandDocument);
  }, [brandDocument, brandDraft]);

  const personalDirty =
    personalDraft !== null &&
    personalBaseline !== null &&
    (!valuesEqual(personalDraft, personalBaseline) ||
      jobTitleDraft !== jobTitleBaseline);
  const companyDirty =
    brandDraft !== null &&
    brandBaseline !== null &&
    !valuesEqual(brandDraft, brandBaseline);

  const senderOptions = useMemo(
    () =>
      listCompanyEmailSenderOptions({
        companyId,
        channels,
        settingsFromEmail: emailSettings?.fromEmail ?? null,
        settingsFromName: emailSettings?.fromName ?? null,
      }),
    [channels, companyId, emailSettings?.fromEmail, emailSettings?.fromName],
  );

  const selectedSender = useMemo(() => {
    const defaultChannelId = channels.find((row) => row.is_default)?.id ?? null;
    return resolveSelectedCompanyEmailChannelId({
      companyId,
      channels,
      selectedChannelId: defaultChannelId,
      settingsFromEmail: emailSettings?.fromEmail ?? null,
      settingsFromName: emailSettings?.fromName ?? null,
    });
  }, [channels, companyId, emailSettings?.fromEmail, emailSettings?.fromName]);

  const patchPersonalSignature = (patch: Partial<EmailSignatureConfig>) => {
    setPersonalDraft((previous) =>
      previous
        ? {
            ...previous,
            signature: {
              ...previous.signature,
              ...patch,
              colors: {
                ...(previous.signature.colors ?? emptyEmailSignatureColors()),
                ...patch.colors,
              },
            },
          }
        : previous,
    );
  };

  const onSavePersonal = () => {
    if (!personalDraft || !personalDirty) return;
    if (!isValidSignatureEmail(personalDraft.signature.email)) {
      toast({
        title: t("emailModule.settingsHub.identity.personal.saveFailed"),
        description: t(
          "emailModule.settingsHub.identity.signature.invalidEmail",
        ),
        variant: "destructive",
      });
      return;
    }
    if (!isValidSignatureWebsite(personalDraft.signature.website)) {
      toast({
        title: t("emailModule.settingsHub.identity.personal.saveFailed"),
        description: t(
          "emailModule.settingsHub.identity.signature.invalidWebsite",
        ),
        variant: "destructive",
      });
      return;
    }
    savePersonal.mutate(
      { personal: personalDraft, jobTitle: jobTitleDraft },
      {
        onSuccess: (saved) => {
          setPersonalDraft(saved);
          setPersonalBaseline(saved);
          setJobTitleBaseline(jobTitleDraft.trim());
          setJobTitleDraft(jobTitleDraft.trim());
          toast({
            title: t("emailModule.settingsHub.identity.personal.saved"),
          });
        },
        onError: (error) => {
          toast({
            title: t("emailModule.settingsHub.identity.personal.saveFailed"),
            description: error instanceof Error ? error.message : undefined,
            variant: "destructive",
          });
        },
      },
    );
  };

  const patchEmail = (patch: Partial<CompanyBrandEmail>) => {
    setBrandDraft((previous) =>
      previous
        ? {
            ...previous,
            email: {
              ...previous.email,
              ...patch,
              signature: patch.signature
                ? { ...previous.email.signature, ...patch.signature }
                : previous.email.signature,
              social: patch.social
                ? { ...previous.email.social, ...patch.social }
                : previous.email.social,
              acknowledgement: patch.acknowledgement
                ? {
                    ...previous.email.acknowledgement,
                    ...patch.acknowledgement,
                    templates:
                      patch.acknowledgement.templates?.map((template) => ({
                        ...template,
                      })) ?? previous.email.acknowledgement.templates,
                  }
                : previous.email.acknowledgement,
            },
          }
        : previous,
    );
  };

  const patchSignature = (patch: Partial<EmailSignatureConfig>) => {
    const current = brandDraft?.email.signature;
    if (!current) return;
    patchEmail({
      signature: {
        ...current,
        ...patch,
        colors: {
          ...(current.colors ?? emptyEmailSignatureColors()),
          ...patch.colors,
        },
      },
    });
  };

  const patchSignatureColor = (
    field: keyof EmailSignatureColors,
    hex: string,
  ) => {
    patchSignature({
      colors: {
        ...(brandDraft?.email.signature.colors ?? emptyEmailSignatureColors()),
        [field]: hex,
      },
    });
  };

  const patchAcknowledgement = (patch: Partial<EmailAcknowledgementConfig>) => {
    const current =
      brandDraft?.email.acknowledgement ?? emptyEmailAcknowledgement();
    patchEmail({
      acknowledgement: {
        ...current,
        ...patch,
        templates: patch.templates ?? current.templates,
      },
    });
  };

  const patchAckTemplate = (
    language: string,
    patch: { enabled?: boolean; body?: string },
  ) => {
    const current =
      brandDraft?.email.acknowledgement ?? emptyEmailAcknowledgement();
    patchAcknowledgement({
      templates: current.templates.map((template) =>
        template.language === language ? { ...template, ...patch } : template,
      ),
    });
  };

  const syncMailboxIdentityFromBrand = (
    document: CompanyBrandCenterDocument,
  ) => {
    if (!emailSettings || !canConnection) return;
    const draft = companyEmailSettingsToDraft(emailSettings);
    const nextFromName = resolveOutboundFromDisplayName({
      senderName: document.email.senderName,
      senderDisplayName: document.email.senderDisplayName,
    });
    const nextReplyTo = document.email.replyEmail.trim();
    const patch = {
      ...draft,
      fromName: nextFromName || draft.fromName,
      replyToEmail: nextReplyTo || draft.replyToEmail,
    };
    if (
      patch.fromName === draft.fromName &&
      patch.replyToEmail === draft.replyToEmail
    )
      return;
    updateSettings.mutate(patch);
  };

  const onSaveCompany = () => {
    if (!brandDraft || !canEditCompany || !companyDirty) return;
    const signature = brandDraft.email.signature;
    if (!isValidSignatureEmail(signature.email)) {
      toast({
        title: t("emailModule.settingsHub.identity.saveFailed"),
        description: t(
          "emailModule.settingsHub.identity.signature.invalidEmail",
        ),
        variant: "destructive",
      });
      return;
    }
    if (!isValidSignatureWebsite(signature.website)) {
      toast({
        title: t("emailModule.settingsHub.identity.saveFailed"),
        description: t(
          "emailModule.settingsHub.identity.signature.invalidWebsite",
        ),
        variant: "destructive",
      });
      return;
    }
    saveCompany.mutate(
      {
        ...brandDraft,
        email: {
          ...brandDraft.email,
          signature: {
            name: signature.name.trim(),
            title: signature.title.trim(),
            email: signature.email.trim(),
            website: signature.website.trim(),
            colors: {
              ...emptyEmailSignatureColors(),
              ...signature.colors,
            },
          },
        },
      },
      {
        onSuccess: (saved) => {
          setBrandDraft(saved);
          setBrandBaseline(saved);
          syncMailboxIdentityFromBrand(saved);
          toast({ title: t("emailModule.settingsHub.identity.saved") });
        },
        onError: (error) => {
          toast({
            title: t("emailModule.settingsHub.identity.saveFailed"),
            description: error instanceof Error ? error.message : undefined,
            variant: "destructive",
          });
        },
      },
    );
  };

  const onSwitchAccount = (channelId: string) => {
    if (!canConnection) return;
    const option = senderOptions.find((row) => row.id === channelId);
    if (!option) return;
    setDefault.mutate(
      { companyChannelId: channelId, channelTypeKey: "email" },
      {
        onError: (error) => {
          toast({
            title: t("emailModule.settingsHub.identity.switchFailed"),
            description: error instanceof Error ? error.message : undefined,
            variant: "destructive",
          });
        },
      },
    );
    if (!emailSettings) return;
    const draft = companyEmailSettingsToDraft(emailSettings);
    const identityFromName =
      resolveOutboundFromDisplayName({
        senderName: brandDraft?.email.senderName,
        senderDisplayName: brandDraft?.email.senderDisplayName,
      }) || option.fromName;
    if (
      draft.fromEmail === option.fromEmail &&
      draft.fromName === identityFromName
    )
      return;
    updateSettings.mutate(
      { ...draft, fromEmail: option.fromEmail, fromName: identityFromName },
      {
        onSuccess: () =>
          toast({ title: t("emailModule.settingsHub.identity.switchSaved") }),
        onError: (error) => {
          toast({
            title: t("emailModule.settingsHub.identity.switchFailed"),
            description: error instanceof Error ? error.message : undefined,
            variant: "destructive",
          });
        },
      },
    );
  };

  const email = brandDraft?.email ?? createDefaultBrandDocument().email;
  const logos = brandDraft?.logos ?? createDefaultBrandDocument().logos;
  const emailLogoUrl = resolveEmailLogoUrl(logos);
  const switchBusy = setDefault.isPending || updateSettings.isPending;
  const companyLoading =
    brandLoading || (canConnection && (settingsLoading || channelsLoading));

  return (
    <div className="space-y-6" data-testid="email-settings-identity">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">
          {t("emailModule.settingsHub.identity.title")}
        </h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          {t("emailModule.settingsHub.identity.description")}
        </p>
      </header>

      {canManagePersonal ? (
        <section className="space-y-4" data-testid="email-identity-personal">
          <div className="flex items-start gap-3">
            <UserRound className="mt-0.5 size-5 text-primary" aria-hidden />
            <div className="space-y-1">
              <h2 className="font-semibold">
                {t("emailModule.settingsHub.identity.personal.title")}
              </h2>
              <FieldHelper>
                {t("emailModule.settingsHub.identity.personal.description")}
              </FieldHelper>
            </div>
          </div>

          {personalLoading && !personalDraft ? (
            <DashboardCard className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {t("notifications.loading")}
            </DashboardCard>
          ) : personalDraft ? (
            <>
              <DashboardCard className="space-y-4 p-5">
                <div className="flex items-start gap-3">
                  <SectionBadge step="1" />
                  <UserRound className="mt-1 size-4 text-primary" aria-hidden />
                  <div className="min-w-0 flex-1 space-y-1">
                    <h3 className="text-sm font-semibold">
                      {t(
                        "emailModule.settingsHub.identity.senderIdentity.title",
                      )}
                    </h3>
                    <FieldHelper>
                      {t(
                        "emailModule.settingsHub.identity.senderIdentity.description",
                      )}
                    </FieldHelper>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label>
                      {t("companyWorkspace.brandCenter.emailStudio.senderName")}
                    </Label>
                    <FieldHelper>
                      {t(
                        "emailModule.settingsHub.identity.senderIdentity.senderNameHelper",
                      )}
                    </FieldHelper>
                    <Input
                      value={personalDraft.senderName}
                      onChange={(event) =>
                        setPersonalDraft((previous) =>
                          previous
                            ? { ...previous, senderName: event.target.value }
                            : previous,
                        )
                      }
                      data-testid="email-identity-personal-sender-name"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>
                      {t(
                        "companyWorkspace.brandCenter.emailStudio.senderDisplayName",
                      )}
                    </Label>
                    <FieldHelper>
                      {t(
                        "emailModule.settingsHub.identity.senderIdentity.senderDisplayHelper",
                      )}
                    </FieldHelper>
                    <Input
                      value={personalDraft.senderDisplayName}
                      onChange={(event) =>
                        setPersonalDraft((previous) =>
                          previous
                            ? {
                                ...previous,
                                senderDisplayName: event.target.value,
                              }
                            : previous,
                        )
                      }
                      data-testid="email-identity-personal-sender-display"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>
                      {t(
                        "emailModule.settingsHub.identity.personal.jobTitleLabel",
                      )}
                    </Label>
                    <FieldHelper>
                      {t(
                        "emailModule.settingsHub.identity.personal.jobTitleHelper",
                      )}
                    </FieldHelper>
                    <Input
                      value={jobTitleDraft}
                      onChange={(event) => setJobTitleDraft(event.target.value)}
                      data-testid="email-identity-personal-job-title"
                    />
                  </div>
                </div>
              </DashboardCard>

              <SignatureCard
                step="2"
                title={t(
                  "emailModule.settingsHub.identity.personal.signatureTitle",
                )}
                description={t(
                  "emailModule.settingsHub.identity.personal.signatureDescription",
                )}
                signature={personalDraft.signature}
                testId="email-identity-personal-signature"
                fieldTestIdPrefix="email-identity-personal-signature"
                onPatch={patchPersonalSignature}
              />

              <div className="flex justify-end rounded-xl border border-border bg-card px-4 py-3">
                <Button
                  type="button"
                  disabled={!personalDirty || savePersonal.isPending}
                  onClick={onSavePersonal}
                  data-testid="email-identity-personal-save"
                >
                  {savePersonal.isPending ? (
                    <Loader2 className="me-1.5 size-4 animate-spin" />
                  ) : null}
                  {t("emailModule.settingsHub.identity.personal.saveChanges")}
                </Button>
              </div>
            </>
          ) : null}
        </section>
      ) : null}

      {canEditCompany ? (
        <section className="space-y-4" data-testid="email-identity-company">
          <div className="flex items-start gap-3">
            <Building2 className="mt-0.5 size-5 text-primary" aria-hidden />
            <div className="space-y-1">
              <h2 className="font-semibold">
                {t("emailModule.settingsHub.identity.company.title")}
              </h2>
              <FieldHelper>
                {t("emailModule.settingsHub.identity.company.description")}
              </FieldHelper>
            </div>
          </div>

          {companyLoading && !brandDraft ? (
            <DashboardCard className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {t("notifications.loading")}
            </DashboardCard>
          ) : (
            <>
              <div data-testid="email-identity-logo">
                <DashboardCard className="space-y-4 p-5">
                  <div className="flex items-start gap-3">
                    <SectionBadge step="1" />
                    <ImageIcon
                      className="mt-1 size-4 text-primary"
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1 space-y-1">
                      <h3 className="text-sm font-semibold">
                        {t("emailModule.settingsHub.identity.logo.title")}
                      </h3>
                      <FieldHelper>
                        {t("emailModule.settingsHub.identity.logo.description")}
                      </FieldHelper>
                    </div>
                  </div>
                  <BrandAssetUploadCard
                    companyId={companyId}
                    slot="email"
                    label={t("emailModule.settingsHub.identity.logo.title")}
                    hint={t("emailModule.settingsHub.identity.logo.helper")}
                    url={logos.email}
                    readOnly={!canEditCompany}
                    onUploaded={(url) =>
                      setBrandDraft((previous) =>
                        previous
                          ? {
                              ...previous,
                              logos: { ...previous.logos, email: url },
                            }
                          : previous,
                      )
                    }
                    onDeleted={() =>
                      setBrandDraft((previous) =>
                        previous
                          ? {
                              ...previous,
                              logos: { ...previous.logos, email: null },
                            }
                          : previous,
                      )
                    }
                  />
                  {!logos.email && emailLogoUrl ? (
                    <p className="text-xs text-muted-foreground">
                      {t("companyWorkspace.brandCenter.assets.usingPrimary")}
                    </p>
                  ) : null}
                </DashboardCard>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                {canConnection ? (
                <div data-testid="email-identity-switch">
                  <DashboardCard className="space-y-4 p-5">
                    <div className="flex items-start gap-3">
                      <SectionBadge step="2" />
                      <Mail
                        className="mt-1 size-4 text-primary"
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1 space-y-1">
                        <h3 className="text-sm font-semibold">
                          {t(
                            "emailModule.settingsHub.identity.emailSwitch.title",
                          )}
                        </h3>
                        <FieldHelper>
                          {t(
                            "emailModule.settingsHub.identity.emailSwitch.description",
                          )}
                        </FieldHelper>
                      </div>
                    </div>
                    {senderOptions.length === 0 ? (
                      <div className="space-y-3 rounded-lg border border-dashed border-border bg-muted/20 p-3 text-sm">
                        <p className="text-muted-foreground">
                          {t(
                            "emailModule.settingsHub.identity.emailSwitch.empty",
                          )}
                        </p>
                        {emailSettings?.fromEmail ? (
                          <p dir="ltr" className="font-medium">
                            {emailSettings.fromEmail}
                          </p>
                        ) : null}
                        <Button asChild variant="outline" size="sm">
                          <Link href="~/dashboard/settings/email?tab=connection">
                            {t(
                              "emailModule.settingsHub.identity.emailSwitch.openConnection",
                            )}
                          </Link>
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Label htmlFor="email-identity-switch-select">
                          {t(
                            "emailModule.settingsHub.identity.emailSwitch.title",
                          )}
                        </Label>
                        <FieldHelper>
                          {t(
                            "emailModule.settingsHub.identity.emailSwitch.helper",
                          )}
                        </FieldHelper>
                        <Select
                          value={
                            selectedSender?.channelId ?? senderOptions[0]!.id
                          }
                          onValueChange={onSwitchAccount}
                          disabled={switchBusy || senderOptions.length < 2}
                        >
                          <SelectTrigger
                            id="email-identity-switch-select"
                            className="w-full"
                            data-testid="email-identity-switch-select"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {senderOptions.map((option) => (
                              <SelectItem key={option.id} value={option.id}>
                                <span dir="ltr">{option.label}</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </DashboardCard>
                </div>
                ) : null}

                <div data-testid="email-identity-sender">
                  <DashboardCard className="space-y-4 p-5">
                    <div className="flex items-start gap-3">
                      <SectionBadge step="3" />
                      <UserRound
                        className="mt-1 size-4 text-primary"
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1 space-y-1">
                        <h3 className="text-sm font-semibold">
                          {t(
                            "emailModule.settingsHub.identity.senderIdentity.title",
                          )}
                        </h3>
                        <FieldHelper>
                          {t(
                            "emailModule.settingsHub.identity.senderIdentity.description",
                          )}
                        </FieldHelper>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <Label>
                          {t(
                            "companyWorkspace.brandCenter.emailStudio.senderName",
                          )}
                        </Label>
                        <FieldHelper>
                          {t(
                            "emailModule.settingsHub.identity.senderIdentity.senderNameHelper",
                          )}
                        </FieldHelper>
                        <Input
                          value={email.senderName}
                          onChange={(event) =>
                            patchEmail({
                              senderName: event.target.value,
                              header: event.target.value,
                            })
                          }
                          data-testid="email-identity-sender-name"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>
                          {t(
                            "companyWorkspace.brandCenter.emailStudio.senderDisplayName",
                          )}
                        </Label>
                        <FieldHelper>
                          {t(
                            "emailModule.settingsHub.identity.senderIdentity.senderDisplayHelper",
                          )}
                        </FieldHelper>
                        <Input
                          value={email.senderDisplayName}
                          onChange={(event) =>
                            patchEmail({
                              senderDisplayName: event.target.value,
                            })
                          }
                          data-testid="email-identity-sender-display"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>
                          {t("companyWorkspace.brandCenter.replyEmail")}
                        </Label>
                        <FieldHelper>
                          {t(
                            "emailModule.settingsHub.identity.senderIdentity.replyToHelper",
                          )}
                        </FieldHelper>
                        <Input
                          type="email"
                          dir="ltr"
                          value={email.replyEmail}
                          onChange={(event) =>
                            patchEmail({ replyEmail: event.target.value })
                          }
                          data-testid="email-identity-reply-email"
                        />
                      </div>
                    </div>
                  </DashboardCard>
                </div>
              </div>

              <SignatureCard
                step="4"
                title={t(
                  "emailModule.settingsHub.identity.company.signatureTitle",
                )}
                description={t(
                  "emailModule.settingsHub.identity.company.signatureDescription",
                )}
                signature={email.signature}
                testId="email-identity-signature"
                fieldTestIdPrefix="email-identity-signature"
                previewLogoUrl={emailLogoUrl}
                onPatch={(patch) => {
                  patchSignature(patch);
                  if (patch.colors) {
                    (
                      Object.entries(patch.colors) as Array<
                        [keyof EmailSignatureColors, string]
                      >
                    ).forEach(([field, value]) =>
                      patchSignatureColor(field, value),
                    );
                  }
                }}
              />

              <div data-testid="email-identity-acknowledgement">
                <DashboardCard className="space-y-4 p-5">
                  <div className="flex items-start gap-3">
                    <SectionBadge step="5" />
                    <MailCheck
                      className="mt-1 size-4 text-primary"
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1 space-y-1">
                      <h3 className="text-sm font-semibold">
                        {t(
                          "emailModule.settingsHub.identity.acknowledgement.title",
                        )}
                      </h3>
                      <FieldHelper>
                        {t(
                          "emailModule.settingsHub.identity.acknowledgement.description",
                        )}
                      </FieldHelper>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
                    <Label htmlFor="email-identity-ack-enable">
                      {t(
                        "emailModule.settingsHub.identity.acknowledgement.enableLabel",
                      )}
                    </Label>
                    <Switch
                      id="email-identity-ack-enable"
                      checked={email.acknowledgement?.enabled === true}
                      onCheckedChange={(checked) =>
                        patchAcknowledgement({ enabled: checked })
                      }
                      data-testid="email-identity-ack-toggle"
                    />
                  </div>
                  {email.acknowledgement?.enabled ? (
                    <div
                      className="space-y-4"
                      data-testid="email-identity-ack-config"
                    >
                      <div className="space-y-1.5">
                        <Label htmlFor="email-identity-ack-default-lang">
                          {t(
                            "emailModule.settingsHub.identity.acknowledgement.defaultLanguage",
                          )}
                        </Label>
                        <Select
                          value={email.acknowledgement.defaultLanguage || "en"}
                          onValueChange={(value) =>
                            patchAcknowledgement({ defaultLanguage: value })
                          }
                        >
                          <SelectTrigger
                            id="email-identity-ack-default-lang"
                            data-testid="email-identity-ack-default-lang"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(["en", "ar", "fr", "de"] as const).map(
                              (language) => (
                                <SelectItem key={language} value={language}>
                                  {t(
                                    `emailModule.settingsHub.identity.acknowledgement.language${
                                      language === "en"
                                        ? "En"
                                        : language === "ar"
                                          ? "Ar"
                                          : language === "fr"
                                            ? "Fr"
                                            : "De"
                                    }`,
                                  )}
                                </SelectItem>
                              ),
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-3">
                        <h4 className="text-sm font-medium">
                          {t(
                            "emailModule.settingsHub.identity.acknowledgement.templatesTitle",
                          )}
                        </h4>
                        {(["en", "ar", "fr", "de"] as const).map((language) => {
                          const template = email.acknowledgement.templates.find(
                            (row) => row.language === language,
                          ) ?? { language, enabled: true, body: "" };
                          const languageKey =
                            language === "en"
                              ? "languageEn"
                              : language === "ar"
                                ? "languageAr"
                                : language === "fr"
                                  ? "languageFr"
                                  : "languageDe";
                          return (
                            <div
                              key={language}
                              className="space-y-2 rounded-lg border border-border/60 p-3"
                              data-testid={`email-identity-ack-template-${language}`}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <Label className="font-medium">
                                  {t(
                                    `emailModule.settingsHub.identity.acknowledgement.${languageKey}`,
                                  )}
                                </Label>
                                <Switch
                                  checked={template.enabled}
                                  onCheckedChange={(checked) =>
                                    patchAckTemplate(language, {
                                      enabled: checked,
                                    })
                                  }
                                  data-testid={`email-identity-ack-template-${language}-toggle`}
                                />
                              </div>
                              <Label className="text-xs text-muted-foreground">
                                {t(
                                  "emailModule.settingsHub.identity.acknowledgement.templateBody",
                                )}
                              </Label>
                              <Textarea
                                dir={language === "ar" ? "rtl" : "ltr"}
                                value={template.body}
                                disabled={!template.enabled}
                                onChange={(event) =>
                                  patchAckTemplate(language, {
                                    body: event.target.value,
                                  })
                                }
                                rows={3}
                                data-testid={`email-identity-ack-template-${language}-body`}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </DashboardCard>
              </div>

              <div data-testid="email-identity-footer" id="email-footer">
                <DashboardCard className="space-y-4 p-5">
                  <div className="flex items-start gap-3">
                    <SectionBadge step="6" />
                    <FileText
                      className="mt-1 size-4 text-primary"
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1 space-y-1">
                      <h3 className="text-sm font-semibold">
                        {t("emailModule.settingsHub.identity.footer.title")}
                      </h3>
                      <FieldHelper>
                        {t(
                          "emailModule.settingsHub.identity.footer.description",
                        )}
                      </FieldHelper>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
                    <div className="min-w-0 space-y-1">
                      <Label htmlFor="email-identity-show-footer">
                        {t("emailModule.settingsHub.identity.footer.showLabel")}
                      </Label>
                      <FieldHelper>
                        {t("emailModule.settingsHub.identity.footer.helper")}
                      </FieldHelper>
                    </div>
                    <Switch
                      id="email-identity-show-footer"
                      checked={email.showLegalFooter}
                      onCheckedChange={(checked) =>
                        patchEmail({ showLegalFooter: checked })
                      }
                      data-testid="email-identity-footer-toggle"
                    />
                  </div>
                  {email.showLegalFooter ? (
                    <div className="space-y-1.5">
                      <Label htmlFor="email-identity-footer-text">
                        {t("emailModule.settingsHub.identity.footer.textLabel")}
                      </Label>
                      <FieldHelper>
                        {t(
                          "emailModule.settingsHub.identity.footer.textHelper",
                        )}
                      </FieldHelper>
                      <Textarea
                        id="email-identity-footer-text"
                        value={email.legalText}
                        rows={3}
                        placeholder={t(
                          "emailModule.settingsHub.identity.footer.placeholder",
                        )}
                        onChange={(event) =>
                          patchEmail({
                            legalText: event.target.value,
                            footer: event.target.value,
                          })
                        }
                        data-testid="email-identity-footer-text"
                      />
                    </div>
                  ) : null}
                </DashboardCard>
              </div>

              <div className="flex justify-end rounded-xl border border-border bg-card px-4 py-3">
                <Button
                  type="button"
                  disabled={!companyDirty || saveCompany.isPending}
                  onClick={onSaveCompany}
                  data-testid="email-identity-save"
                >
                  {saveCompany.isPending ? (
                    <Loader2 className="me-1.5 size-4 animate-spin" />
                  ) : null}
                  {t("emailModule.settingsHub.identity.saveChanges")}
                </Button>
              </div>
            </>
          )}
        </section>
      ) : null}

      {!canManagePersonal && !canEditCompany ? (
        <DashboardCard className="p-6 text-sm text-muted-foreground">
          {t("emailModule.settingsHub.identity.personal.permissionHint")}
        </DashboardCard>
      ) : null}
    </div>
  );
}
