import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getBranchServices } from "@/lib/company/branches";
import { invalidateBranchQueries } from "@/lib/company/branches/cache";
import {
  mergeBranchSettingsWithHours,
  readBranchWeeklyHours,
  type BranchWeeklyDay,
} from "@/lib/company/branches/branch-weekly-hours";
import type { BranchRecord } from "@/lib/company/branches/types";
import { WEEKDAY_INDICES } from "@/lib/scheduling/types";

type Props = {
  open: boolean;
  onClose: () => void;
  companyId: string;
  branch: BranchRecord | null;
  onSaved?: () => void;
};

const services = getBranchServices();

export function BranchHoursDialog({ open, onClose, companyId, branch, onSaved }: Props) {
  const { t } = useTranslation("common");
  const qc = useQueryClient();
  const [days, setDays] = useState<BranchWeeklyDay[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !branch) return;
    setError(null);
    setDays(readBranchWeeklyHours(branch.settings ?? null));
  }, [open, branch]);

  const updateDay = (dayOfWeek: number, patch: Partial<BranchWeeklyDay>) => {
    setDays((current) =>
      current.map((day) => (day.day_of_week === dayOfWeek ? { ...day, ...patch } : day)),
    );
  };

  const handleSave = async () => {
    if (!branch) return;
    setSaving(true);
    setError(null);
    try {
      for (const day of days) {
        if (!day.is_closed) {
          if (!day.opens_at || !day.closes_at) {
            throw new Error(t("companyWorkspace.branches.hours.validationRequired"));
          }
          if (day.opens_at >= day.closes_at) {
            throw new Error(t("companyWorkspace.branches.hours.validationOrder"));
          }
        }
      }
      const settings = mergeBranchSettingsWithHours(branch.settings ?? null, days);
      await services.repositories.branches.update(branch.id, companyId, { settings });
      invalidateBranchQueries(qc, companyId, branch.id);
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("companyWorkspace.branches.hours.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto border-border/60 bg-card">
        <DialogHeader>
          <DialogTitle>
            {t("companyWorkspace.branches.hours.title", { name: branch?.name ?? "" })}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {error ? (
            <p className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          {WEEKDAY_INDICES.map((dayIndex) => {
            const day = days.find((item) => item.day_of_week === dayIndex);
            if (!day) return null;
            return (
              <div
                key={dayIndex}
                className="flex flex-wrap items-center gap-2 rounded-xl border border-border/50 p-3"
              >
                <p className="min-w-[88px] text-sm font-medium">
                  {t(`scheduling.availability.weekdays.${dayIndex}`)}
                </p>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={!day.is_closed}
                    onCheckedChange={(openDay) =>
                      updateDay(dayIndex, {
                        is_closed: !openDay,
                        opens_at: openDay ? day.opens_at || "09:00" : null,
                        closes_at: openDay ? day.closes_at || "17:00" : null,
                      })
                    }
                  />
                  <span className="text-xs text-muted-foreground">
                    {day.is_closed
                      ? t("companyWorkspace.branches.hours.closed")
                      : t("companyWorkspace.branches.hours.open")}
                  </span>
                </div>
                {!day.is_closed ? (
                  <div className="ms-auto flex items-center gap-2">
                    <Input
                      type="time"
                      value={day.opens_at ?? ""}
                      onChange={(e) => updateDay(dayIndex, { opens_at: e.target.value })}
                      className="h-8 w-[120px]"
                    />
                    <span className="text-xs text-muted-foreground">–</span>
                    <Input
                      type="time"
                      value={day.closes_at ?? ""}
                      onChange={(e) => updateDay(dayIndex, { closes_at: e.target.value })}
                      className="h-8 w-[120px]"
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("buttons.cancel")}
          </Button>
          <Button type="button" onClick={() => void handleSave()}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : t("buttons.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
