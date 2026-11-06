import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AUTH_CONTROL_CLASS } from "@/lib/auth/auth-field-styles";
import {
  createBranchDraft,
  WEEKDAY_INDEXES,
  type BranchDraft,
  type BranchDraftFieldError,
} from "@/lib/companies/onboarding/branch-draft";
import { cn } from "@/lib/utils";

function RequiredMark() {
  return <span className="text-destructive"> *</span>;
}

function errorText(
  code: BranchDraftFieldError | undefined,
  translate: (key: string) => string,
): string | undefined {
  if (!code) return undefined;
  return translate(`auth.register.branches.errors.${code}`);
}

export function OnboardingBranchesStep({
  drafts,
  errors,
  onChange,
}: {
  drafts: BranchDraft[];
  errors: Record<string, Partial<Record<"name" | "address" | "locationUrl" | "hours", BranchDraftFieldError>>>;
  onChange: (drafts: BranchDraft[]) => void;
}) {
  const { t } = useTranslation("common");

  const patchDraft = (clientId: string, partial: Partial<BranchDraft>) => {
    onChange(drafts.map((draft) => (draft.clientId === clientId ? { ...draft, ...partial } : draft)));
  };

  return (
    <div className="space-y-5">
      {drafts.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("auth.register.branches.empty")}</p>
      ) : null}
      {drafts.map((draft, index) => {
        const fieldErrors = errors[draft.clientId] ?? {};
        return (
          <section key={draft.clientId} className="rounded-2xl border border-border/70 bg-muted/10 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">
                {draft.isMain
                  ? t("auth.register.branches.mainTitle")
                  : t("auth.register.branches.extraTitle")}
                {draft.isMain ? null : <span className="ms-2 text-muted-foreground">#{index}</span>}
              </h3>
              {draft.isMain ? (
                <span className="text-xs text-muted-foreground">{t("auth.register.required")}</span>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onChange(drafts.filter((item) => item.clientId !== draft.clientId))}
                >
                  {t("auth.register.branches.remove")}
                </Button>
              )}
            </div>
            <div className="grid grid-cols-1 gap-3">
              <div>
                <Label htmlFor={`${draft.clientId}-name`}>
                  {t("auth.register.branches.name")}
                  <RequiredMark />
                </Label>
                <Input
                  id={`${draft.clientId}-name`}
                  className={cn("mt-1.5", AUTH_CONTROL_CLASS, fieldErrors.name && "border-destructive")}
                  value={draft.name}
                  onChange={(event) => patchDraft(draft.clientId, { name: event.target.value })}
                />
                {fieldErrors.name ? (
                  <p className="mt-1 text-xs text-destructive">{errorText(fieldErrors.name, t)}</p>
                ) : null}
              </div>
              <div>
                <Label htmlFor={`${draft.clientId}-address`}>
                  {t("auth.register.branches.address")}
                  <RequiredMark />
                </Label>
                <Input
                  id={`${draft.clientId}-address`}
                  className={cn("mt-1.5", AUTH_CONTROL_CLASS, fieldErrors.address && "border-destructive")}
                  value={draft.address}
                  onChange={(event) => patchDraft(draft.clientId, { address: event.target.value })}
                />
                {fieldErrors.address ? (
                  <p className="mt-1 text-xs text-destructive">{errorText(fieldErrors.address, t)}</p>
                ) : null}
              </div>
              <div>
                <Label htmlFor={`${draft.clientId}-url`}>
                  {t("auth.register.branches.locationUrl")}
                  <RequiredMark />
                </Label>
                <Input
                  id={`${draft.clientId}-url`}
                  type="url"
                  inputMode="url"
                  placeholder="https://"
                  className={cn("mt-1.5", AUTH_CONTROL_CLASS, fieldErrors.locationUrl && "border-destructive")}
                  value={draft.locationUrl}
                  onChange={(event) => patchDraft(draft.clientId, { locationUrl: event.target.value })}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">{t("auth.register.branches.locationHint")}</p>
                {fieldErrors.locationUrl ? (
                  <p className="mt-1 text-xs text-destructive">{errorText(fieldErrors.locationUrl, t)}</p>
                ) : null}
              </div>
            </div>
            <div className="mt-4">
              <p className="text-sm font-medium">{t("auth.register.branches.hours")}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{t("auth.register.branches.hoursHint")}</p>
              <div className="mt-3 space-y-2">
                {WEEKDAY_INDEXES.map((day) => {
                  const row = draft.days.find((item) => item.dayOfWeek === day);
                  if (!row) return null;
                  return (
                    <div key={day} className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[8rem_5rem_1fr_1fr]">
                      <span className="text-sm">{t(`auth.register.branches.weekdays.${day}`)}</span>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={row.closed}
                          onChange={(event) =>
                            patchDraft(draft.clientId, {
                              days: draft.days.map((item) =>
                                item.dayOfWeek === day
                                  ? {
                                      ...item,
                                      closed: event.target.checked,
                                      opensAt: event.target.checked ? "" : item.opensAt || "09:00",
                                      closesAt: event.target.checked ? "" : item.closesAt || "17:00",
                                    }
                                  : item,
                              ),
                            })
                          }
                        />
                        {t("auth.register.branches.closed")}
                      </label>
                      <Input
                        type="time"
                        aria-label={t("auth.register.branches.opens")}
                        disabled={row.closed}
                        value={row.closed ? "" : row.opensAt}
                        onChange={(event) =>
                          patchDraft(draft.clientId, {
                            days: draft.days.map((item) =>
                              item.dayOfWeek === day ? { ...item, opensAt: event.target.value } : item,
                            ),
                          })
                        }
                      />
                      <Input
                        type="time"
                        aria-label={t("auth.register.branches.closes")}
                        disabled={row.closed}
                        value={row.closed ? "" : row.closesAt}
                        onChange={(event) =>
                          patchDraft(draft.clientId, {
                            days: draft.days.map((item) =>
                              item.dayOfWeek === day ? { ...item, closesAt: event.target.value } : item,
                            ),
                          })
                        }
                      />
                    </div>
                  );
                })}
              </div>
              {fieldErrors.hours ? (
                <p className="mt-2 text-xs text-destructive">{errorText(fieldErrors.hours, t)}</p>
              ) : null}
            </div>
          </section>
        );
      })}
      <Button
        type="button"
        variant="outline"
        onClick={() =>
          onChange([
            ...drafts,
            createBranchDraft({ isMain: false, clientId: `branch-${drafts.length}-${Date.now()}` }),
          ])
        }
      >
        {t("auth.register.branches.add")}
      </Button>
    </div>
  );
}
