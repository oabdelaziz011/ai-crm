import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/auth-context";
import { useAuthUser } from "@/hooks/use-rbac";
import { useCommercialFeatureLookup } from "@/hooks/billing/use-commercial-feature-lookup";
import {
  useEmailRoutingConfig,
  useUpsertEmailRoutingConfig,
} from "@/hooks/email/use-email-routing-config";
import { DashboardCard, DashboardPageFallback } from "@/components/dashboard/ui";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  EMAIL_ROUTING_CATEGORIES,
  type EmailRoutingCategoryDraft,
  type EmailRoutingConfigTargetType,
} from "@/lib/email-routing/types";

const CLEAR_VALUE = "__clear__";

const CATEGORY_LABEL_KEYS: Record<(typeof EMAIL_ROUTING_CATEGORIES)[number], string> = {
  sales: "emailModule.aiRouting.categories.sales",
  support: "emailModule.aiRouting.categories.support",
  billing: "emailModule.aiRouting.categories.billing",
  complaint: "emailModule.aiRouting.categories.complaint",
  hr: "emailModule.aiRouting.categories.hr",
  general_inquiry: "emailModule.aiRouting.categories.generalInquiry",
};

function draftsEqual(a: EmailRoutingCategoryDraft[], b: EmailRoutingCategoryDraft[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((row, index) => {
    const other = b[index];
    return (
      row.category === other?.category &&
      row.enabled === other?.enabled &&
      row.targetType === other?.targetType &&
      (row.targetId ?? null) === (other?.targetId ?? null)
    );
  });
}

export function EmailAiRoutingPage() {
  const { t } = useTranslation("common");
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const { lookup: commercialFeatureEnabled } = useCommercialFeatureLookup();
  const entitled = isSuperAdmin || commercialFeatureEnabled("ai_email_routing") === true;
  const canEdit = isSuperAdmin || hasPermission("settings.edit");

  const { data, isLoading, isError, error, refetch } = useEmailRoutingConfig(companyId, entitled);
  const upsert = useUpsertEmailRoutingConfig(companyId);
  const [drafts, setDrafts] = useState<EmailRoutingCategoryDraft[]>([]);

  useEffect(() => {
    if (!data?.categories) return;
    setDrafts(
      data.categories.map((row) => ({
        category: row.category,
        enabled: row.enabled,
        targetType: row.targetType,
        targetId: row.targetId,
      })),
    );
  }, [data]);

  const baseline = useMemo<EmailRoutingCategoryDraft[]>(
    () =>
      (data?.categories ?? []).map((row) => ({
        category: row.category,
        enabled: row.enabled,
        targetType: row.targetType,
        targetId: row.targetId,
      })),
    [data],
  );

  const dirty = drafts.length > 0 && !draftsEqual(drafts, baseline);
  const targetOptions = data?.targetOptions;
  const effectiveCanEdit = canEdit && (data?.canEdit !== false || isSuperAdmin);

  function updateRow(category: string, patch: Partial<EmailRoutingCategoryDraft>) {
    setDrafts((prev) =>
      prev.map((row) => (row.category === category ? { ...row, ...patch } : row)),
    );
  }

  function optionsFor(type: EmailRoutingConfigTargetType) {
    if (!targetOptions) return [];
    if (type === "department") return targetOptions.departments;
    if (type === "employee") return targetOptions.employees;
    return targetOptions.queues;
  }

  async function onSave() {
    if (!effectiveCanEdit) return;
    try {
      await upsert.mutateAsync(drafts);
      toast.success(t("emailModule.aiRouting.saveSuccess"));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("emailModule.aiRouting.saveError"),
      );
    }
  }

  if (!companyId) {
    return <DashboardPageFallback />;
  }

  if (!entitled) {
    return (
      <DashboardCard className="p-6">
        <h2 className="text-lg font-semibold">{t("emailModule.aiRouting.title")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("emailModule.aiRouting.notEntitled")}
        </p>
      </DashboardCard>
    );
  }

  if (isLoading) {
    return (
      <DashboardCard className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t("emailModule.aiRouting.loading")}
      </DashboardCard>
    );
  }

  if (isError) {
    return (
      <DashboardCard className="space-y-3 p-6">
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : t("emailModule.aiRouting.loadError")}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
          {t("emailModule.aiRouting.retry")}
        </Button>
      </DashboardCard>
    );
  }

  const hasAnyTarget = drafts.some((row) => Boolean(row.targetId));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t("emailModule.aiRouting.title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("emailModule.aiRouting.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">{t("emailModule.aiRouting.statusLabel")}</span>
          <span className="rounded-md bg-emerald-500/10 px-2 py-1 font-medium text-emerald-700 dark:text-emerald-300">
            {t("emailModule.aiRouting.statusEnabled")}
          </span>
          {dirty ? (
            <span className="rounded-md bg-amber-500/10 px-2 py-1 text-amber-800 dark:text-amber-200">
              {t("emailModule.aiRouting.unsaved")}
            </span>
          ) : null}
        </div>
      </div>

      {!hasAnyTarget ? (
        <DashboardCard className="p-4">
          <p className="text-sm text-muted-foreground">{t("emailModule.aiRouting.empty")}</p>
        </DashboardCard>
      ) : null}

      <DashboardCard className="overflow-x-auto p-0">
        <div className="min-w-[720px]">
          <div className="grid grid-cols-[minmax(7rem,1fr)_5.5rem_minmax(9rem,1fr)_minmax(11rem,1.4fr)] items-center gap-4 border-b bg-muted/40 px-4 py-3 text-xs font-medium text-muted-foreground">
            <div className="text-start">{t("emailModule.aiRouting.columns.category")}</div>
            <div className="text-start">{t("emailModule.aiRouting.columns.enabled")}</div>
            <div className="text-start">{t("emailModule.aiRouting.columns.targetType")}</div>
            <div className="text-start">{t("emailModule.aiRouting.columns.target")}</div>
          </div>
          <div>
            {drafts.map((row) => {
              const options = optionsFor(row.targetType);
              return (
                <div
                  key={row.category}
                  className="grid grid-cols-[minmax(7rem,1fr)_5.5rem_minmax(9rem,1fr)_minmax(11rem,1.4fr)] items-center gap-4 border-b px-4 py-3 text-sm last:border-0"
                >
                  <div className="min-w-0 truncate font-medium text-start">
                    {t(CATEGORY_LABEL_KEYS[row.category])}
                  </div>
                  <div className="flex items-center justify-start">
                    <Switch
                      checked={row.enabled}
                      disabled={!effectiveCanEdit || upsert.isPending}
                      onCheckedChange={(checked) =>
                        updateRow(row.category, { enabled: checked })
                      }
                      aria-label={
                        row.enabled
                          ? t("emailModule.aiRouting.enabled")
                          : t("emailModule.aiRouting.disabled")
                      }
                    />
                  </div>
                  <div className="min-w-0">
                    <Select
                      value={row.targetType}
                      disabled={!effectiveCanEdit || upsert.isPending}
                      onValueChange={(value) =>
                        updateRow(row.category, {
                          targetType: value as EmailRoutingConfigTargetType,
                          targetId: null,
                        })
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="department">
                          {t("emailModule.aiRouting.targetTypes.department")}
                        </SelectItem>
                        <SelectItem value="employee">
                          {t("emailModule.aiRouting.targetTypes.employee")}
                        </SelectItem>
                        <SelectItem value="queue">
                          {t("emailModule.aiRouting.targetTypes.queue")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="min-w-0">
                    <Select
                      value={row.targetId ?? CLEAR_VALUE}
                      disabled={!effectiveCanEdit || upsert.isPending}
                      onValueChange={(value) =>
                        updateRow(row.category, {
                          targetId: value === CLEAR_VALUE ? null : value,
                        })
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue
                          placeholder={
                            options.length === 0
                              ? t("emailModule.aiRouting.noTargets")
                              : t("emailModule.aiRouting.selectTarget")
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={CLEAR_VALUE}>
                          {t("emailModule.aiRouting.clearTarget")}
                        </SelectItem>
                        {options.map((option) => (
                          <SelectItem key={option.id} value={option.id}>
                            {option.name}
                            {option.email ? ` (${option.email})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </DashboardCard>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          onClick={() => void onSave()}
          disabled={!effectiveCanEdit || !dirty || upsert.isPending}
        >
          {upsert.isPending ? (
            <>
              <Loader2 className="me-2 h-4 w-4 animate-spin" />
              {t("emailModule.aiRouting.saving")}
            </>
          ) : (
            t("emailModule.aiRouting.save")
          )}
        </Button>
        {!effectiveCanEdit ? (
          <p className="text-sm text-muted-foreground">
            {t("emailModule.aiRouting.readOnly")}
          </p>
        ) : null}
      </div>
    </div>
  );
}
