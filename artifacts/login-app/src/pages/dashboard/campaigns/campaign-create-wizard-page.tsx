import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { DashboardCard, DashboardErrorBanner } from "@/components/dashboard/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { campaignDetailHref, campaignListHref } from "@/config/campaigns-route-registry";
import {
  useCampaignEligibilityPreview,
  useCreateAndExecuteCampaign,
} from "@/hooks/campaigns/use-campaigns";
import { useCustomers } from "@/hooks/use-customers";
import { useCompanyPermissionAuth } from "@/hooks/billing/use-company-permission-auth";
import type {
  CampaignAudienceDefinition,
  MarketingCampaignChannel,
} from "@/lib/campaigns";
import {
  clearCampaignSubmissionIdempotencyKey,
  getOrCreateCampaignSubmissionIdempotencyKey,
} from "@/lib/campaigns/campaign-submission-idempotency";
import {
  CAMPAIGN_UI_CHANNELS,
  channelLabelKey,
} from "@/lib/campaigns/campaign-ui-presentation";
import { renderMetaMessagingCampaignText } from "@/lib/campaigns/thread-eligibility";
import { cn } from "@/lib/utils";

type WizardStep = 1 | 2 | 3 | 4;
type AudienceMode = "all" | "filtered" | "manual";

export function CampaignCreateWizardPage() {
  const { t } = useTranslation("common");
  const [, setLocation] = useLocation();
  const { companyId, hasCompanyPermission, isSuperAdmin } = useCompanyPermissionAuth();
  const canCreate = isSuperAdmin || hasCompanyPermission("campaigns.create");
  const canSend = isSuperAdmin || hasCompanyPermission("campaigns.send");

  const [step, setStep] = useState<WizardStep>(1);
  const [audienceMode, setAudienceMode] = useState<AudienceMode>("all");
  const [gender, setGender] = useState("all");
  const [ageMin, setAgeMin] = useState("");
  const [ageMax, setAgeMax] = useState("");
  const [search, setSearch] = useState("");
  const [manualIds, setManualIds] = useState<string[]>([]);
  const [channels, setChannels] = useState<MarketingCampaignChannel[]>(["whatsapp"]);
  const [name, setName] = useState("");
  const [campaignTitle, setCampaignTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  /** One stable submission key for this wizard lifecycle (+ sessionStorage across tabs). */
  const submissionIdempotencyKey = useMemo(() => {
    if (!companyId) return null;
    return getOrCreateCampaignSubmissionIdempotencyKey({ companyId });
  }, [companyId]);

  const { data: customers = [] } = useCustomers(200);
  const executeMutation = useCreateAndExecuteCampaign();

  const audience: CampaignAudienceDefinition = useMemo(() => {
    if (audienceMode === "manual") {
      return { type: "manual", customerIds: manualIds };
    }
    if (audienceMode === "filtered") {
      return {
        type: "filtered",
        filters: {
          search: search.trim() || null,
          gender: gender === "all" ? null : gender,
          ageMin: ageMin ? Number(ageMin) : null,
          ageMax: ageMax ? Number(ageMax) : null,
        },
      };
    }
    return { type: "all" };
  }, [audienceMode, manualIds, search, gender, ageMin, ageMax]);

  const eligibilityEnabled = channels.length > 0;
  const eligibility = useCampaignEligibilityPreview(audience, channels, eligibilityEnabled);

  if (!canCreate) {
    return <DashboardErrorBanner message={t("campaigns.noPermissionCreate")} />;
  }

  const toggleChannel = (channel: MarketingCampaignChannel) => {
    setChannels((prev) =>
      prev.includes(channel) ? prev.filter((c) => c !== channel) : [...prev, channel],
    );
  };

  const toggleManualCustomer = (id: string) => {
    setManualIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const validateStep = (current: WizardStep): boolean => {
    if (current === 1 && audienceMode === "manual" && manualIds.length === 0) {
      toast.error(t("campaigns.wizard.errors.manualEmpty"));
      return false;
    }
    if (current === 2 && channels.length === 0) {
      toast.error(t("campaigns.wizard.errors.channelsRequired"));
      return false;
    }
    if (current === 3) {
      if (!name.trim() || !campaignTitle.trim()) {
        toast.error(t("campaigns.wizard.errors.contentRequired"));
        return false;
      }
    }
    return true;
  };

  const goNext = () => {
    if (!validateStep(step)) return;
    setStep((s) => Math.min(4, s + 1) as WizardStep);
  };

  const goBack = () => setStep((s) => Math.max(1, s - 1) as WizardStep);

  const onConfirmSend = async () => {
    if (!canSend) {
      toast.error(t("campaigns.noPermissionSend"));
      return;
    }
    if (!confirmed) {
      toast.error(t("campaigns.wizard.errors.confirmRequired"));
      return;
    }
    if (!validateStep(1) || !validateStep(2) || !validateStep(3)) return;
    if (!companyId || !submissionIdempotencyKey) {
      toast.error(t("campaigns.wizard.executeFailed"));
      return;
    }

    try {
      const { draft, result } = await executeMutation.mutateAsync({
        name: name.trim(),
        audience,
        content: { campaignTitle: campaignTitle.trim(), detail: detail.trim() },
        channels,
        idempotencyKey: submissionIdempotencyKey,
      });
      clearCampaignSubmissionIdempotencyKey({ companyId });
      toast.success(
        t("campaigns.wizard.executeSuccess", {
          queued: result.queuedCount,
          sent: result.sentCount,
          skipped: result.skippedCount,
          failed: result.failedCount,
        }),
      );
      setLocation(campaignDetailHref(draft.id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("campaigns.wizard.executeFailed"));
    }
  };

  const plainPreview = renderMetaMessagingCampaignText({
    campaignTitle: campaignTitle.trim() || t("campaigns.wizard.content.titlePlaceholder"),
    detail: detail.trim() || t("campaigns.wizard.content.detailPlaceholder"),
  });

  return (
    <div className="space-y-4" data-testid="campaign-create-wizard">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t("campaigns.wizard.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("campaigns.wizard.subtitle")}</p>
        </div>
        <Button variant="outline" onClick={() => setLocation(campaignListHref())}>
          {t("campaigns.wizard.cancel")}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {([1, 2, 3, 4] as WizardStep[]).map((n) => (
          <Badge
            key={n}
            variant={step === n ? "default" : "outline"}
            className={cn(step > n && "opacity-70")}
          >
            {t(`campaigns.wizard.steps.${n}`)}
          </Badge>
        ))}
      </div>

      {step === 1 ? (
        <DashboardCard className="space-y-4 p-6" data-testid="campaign-step-audience">
          <h3 className="font-semibold">{t("campaigns.wizard.audience.title")}</h3>
          <div className="space-y-2">
            {(
              [
                ["all", "campaigns.wizard.audience.all"],
                ["filtered", "campaigns.wizard.audience.filtered"],
                ["manual", "campaigns.wizard.audience.manual"],
              ] as const
            ).map(([mode, key]) => (
              <label key={mode} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="audience-mode"
                  checked={audienceMode === mode}
                  onChange={() => setAudienceMode(mode)}
                />
                {t(key)}
              </label>
            ))}
          </div>

          {audienceMode === "filtered" ? (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>{t("campaigns.wizard.audience.search")}</Label>
                <Input value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>{t("campaigns.wizard.audience.gender")}</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                >
                  <option value="all">{t("campaigns.wizard.audience.genderAll")}</option>
                  <option value="male">{t("campaigns.wizard.audience.genderMale")}</option>
                  <option value="female">{t("campaigns.wizard.audience.genderFemale")}</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label>{t("campaigns.wizard.audience.ageMin")}</Label>
                <Input
                  type="number"
                  value={ageMin}
                  onChange={(e) => setAgeMin(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>{t("campaigns.wizard.audience.ageMax")}</Label>
                <Input
                  type="number"
                  value={ageMax}
                  onChange={(e) => setAgeMax(e.target.value)}
                />
              </div>
            </div>
          ) : null}

          {audienceMode === "manual" ? (
            <div className="max-h-64 space-y-2 overflow-y-auto rounded-md border p-3">
              {customers.map((customer) => (
                <label key={customer.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={manualIds.includes(customer.id)}
                    onCheckedChange={() => toggleManualCustomer(customer.id)}
                  />
                  <span>{customer.name}</span>
                  <span className="text-muted-foreground">{customer.phone ?? "—"}</span>
                </label>
              ))}
            </div>
          ) : null}

          <p className="text-sm text-muted-foreground">{t("campaigns.wizard.audience.serverSideNote")}</p>
          {eligibility.data ? (
            <div className="rounded-md bg-muted/40 p-3 text-sm space-y-1" data-testid="campaign-audience-counts">
              <p>
                {t("campaigns.wizard.eligibility.audience", {
                  count: eligibility.data.marketingEligibleCount,
                })}
              </p>
              <p className="text-muted-foreground">
                {t("campaigns.wizard.eligibility.optOut", {
                  count: eligibility.data.excludedOptedOutCount,
                })}
              </p>
              <p className="text-muted-foreground">
                {t("campaigns.wizard.eligibility.totalAudience", {
                  count: eligibility.data.audienceCount,
                })}
              </p>
            </div>
          ) : eligibility.isFetching ? (
            <p className="text-sm text-muted-foreground">{t("campaigns.wizard.channels.calculating")}</p>
          ) : null}
        </DashboardCard>
      ) : null}

      {step === 2 ? (
        <DashboardCard className="space-y-4 p-6" data-testid="campaign-step-channels">
          <h3 className="font-semibold">{t("campaigns.wizard.channels.title")}</h3>
          <p className="text-sm text-muted-foreground">{t("campaigns.wizard.channels.subtitle")}</p>
          <div className="space-y-3">
            {CAMPAIGN_UI_CHANNELS.map((channel) => {
              const preview = eligibility.data?.byChannel.find((row) => row.channel === channel);
              return (
                <div key={channel} className="rounded-lg border p-3 space-y-2">
                  <label className="flex items-center gap-2 font-medium">
                    <Checkbox
                      checked={channels.includes(channel)}
                      onCheckedChange={() => toggleChannel(channel)}
                      data-testid={`campaign-channel-${channel}`}
                    />
                    {t(channelLabelKey(channel))}
                  </label>
                  {preview ? (
                    <div className="text-sm text-muted-foreground space-y-1 ps-6">
                      {preview.companyAvailable ? (
                        <p>{t("campaigns.wizard.channels.connected")}</p>
                      ) : (
                        <p>{t("campaigns.wizard.channels.unavailable")}</p>
                      )}
                      {channel !== "whatsapp" ? (
                        <p>{t("campaigns.wizard.channels.sessionLimitation")}</p>
                      ) : null}
                      <p>
                        {t("campaigns.wizard.channels.eligibleCount", {
                          eligible: preview.eligible,
                          skipped: preview.skipped,
                        })}
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground ps-6">
                      {eligibility.isFetching
                        ? t("campaigns.wizard.channels.calculating")
                        : t("campaigns.wizard.channels.selectToPreview")}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          <div className="hidden" data-testid="campaign-channel-sms-absent" aria-hidden>
            sms-hidden
          </div>
          {eligibility.data ? (
            <div className="rounded-md bg-muted/40 p-3 text-sm space-y-1">
              <p>
                {t("campaigns.wizard.eligibility.audience", {
                  count: eligibility.data.marketingEligibleCount,
                })}
              </p>
              <p className="text-muted-foreground">
                {t("campaigns.wizard.eligibility.optOut", {
                  count: eligibility.data.excludedOptedOutCount,
                })}
              </p>
            </div>
          ) : null}
        </DashboardCard>
      ) : null}

      {step === 3 ? (
        <DashboardCard className="space-y-4 p-6" data-testid="campaign-step-content">
          <h3 className="font-semibold">{t("campaigns.wizard.content.title")}</h3>
          <div className="space-y-1">
            <Label>{t("campaigns.wizard.content.name")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>{t("campaigns.wizard.content.campaignTitle")}</Label>
            <Input value={campaignTitle} onChange={(e) => setCampaignTitle(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>{t("campaigns.wizard.content.detail")}</Label>
            <Textarea value={detail} onChange={(e) => setDetail(e.target.value)} rows={5} />
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {channels.includes("whatsapp") ? (
              <div className="rounded-md border p-3 text-sm space-y-1">
                <p className="font-medium">{t("campaigns.channels.whatsapp")}</p>
                <p className="text-muted-foreground">{t("campaigns.wizard.content.whatsappPreviewHint")}</p>
                <p>{campaignTitle || "…"}</p>
                <p>{detail || "…"}</p>
              </div>
            ) : null}
            {channels.includes("instagram") ? (
              <div className="rounded-md border p-3 text-sm space-y-1">
                <p className="font-medium">{t("campaigns.channels.instagram")}</p>
                <p className="text-muted-foreground">{t("campaigns.wizard.content.plainPreviewHint")}</p>
                <pre className="whitespace-pre-wrap font-sans">{plainPreview}</pre>
              </div>
            ) : null}
            {channels.includes("messenger") ? (
              <div className="rounded-md border p-3 text-sm space-y-1">
                <p className="font-medium">{t("campaigns.channels.messenger")}</p>
                <p className="text-muted-foreground">{t("campaigns.wizard.content.plainPreviewHint")}</p>
                <pre className="whitespace-pre-wrap font-sans">{plainPreview}</pre>
              </div>
            ) : null}
          </div>
        </DashboardCard>
      ) : null}

      {step === 4 ? (
        <DashboardCard className="space-y-4 p-6" data-testid="campaign-step-review">
          <h3 className="font-semibold">{t("campaigns.wizard.review.title")}</h3>
          <dl className="grid gap-2 text-sm md:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">{t("campaigns.wizard.content.name")}</dt>
              <dd className="font-medium">{name}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("campaigns.wizard.audience.title")}</dt>
              <dd className="font-medium">{t(`campaigns.audienceType.${audienceMode}`)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("campaigns.wizard.content.campaignTitle")}</dt>
              <dd className="font-medium">{campaignTitle}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("campaigns.wizard.channels.title")}</dt>
              <dd className="flex flex-wrap gap-1">
                {channels.map((channel) => (
                  <Badge key={channel} variant="secondary">
                    {t(channelLabelKey(channel))}
                  </Badge>
                ))}
              </dd>
            </div>
          </dl>
          {eligibility.data ? (
            <div className="space-y-2 rounded-md border p-3 text-sm">
              <p>
                {t("campaigns.wizard.eligibility.audience", {
                  count: eligibility.data.marketingEligibleCount,
                })}
              </p>
              {eligibility.data.byChannel.map((row) => (
                <p key={row.channel}>
                  {t(channelLabelKey(row.channel))}:{" "}
                  {t("campaigns.wizard.channels.eligibleCount", {
                    eligible: row.eligible,
                    skipped: row.skipped,
                  })}
                </p>
              ))}
              <p className="text-muted-foreground">{t("campaigns.wizard.review.skipExplain")}</p>
            </div>
          ) : null}
          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={confirmed}
              onCheckedChange={(value) => setConfirmed(value === true)}
              data-testid="campaign-confirm-checkbox"
            />
            <span>{t("campaigns.wizard.review.confirmLabel")}</span>
          </label>
        </DashboardCard>
      ) : null}

      <div className="flex justify-between gap-3">
        <Button variant="outline" onClick={goBack} disabled={step === 1 || executeMutation.isPending}>
          {t("campaigns.wizard.back")}
        </Button>
        {step < 4 ? (
          <Button onClick={goNext} data-testid="campaign-wizard-next">
            {t("campaigns.wizard.next")}
          </Button>
        ) : (
          <Button
            onClick={() => void onConfirmSend()}
            disabled={!canSend || executeMutation.isPending}
            data-testid="campaign-confirm-send"
          >
            {executeMutation.isPending
              ? t("campaigns.wizard.sending")
              : t("campaigns.wizard.confirmSend")}
          </Button>
        )}
      </div>
    </div>
  );
}
