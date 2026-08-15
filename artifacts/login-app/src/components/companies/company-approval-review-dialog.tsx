import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  useApproveCompany,
  useRejectCompany,
} from "@/hooks/companies/use-company-approval";
import { useCompanyEntitlements } from "@/hooks/billing/use-company-entitlements";
import { formatCompanyLocation } from "@/components/companies/company-onboarding-wizard";
import type { Company } from "@/lib/types";
import { cn } from "@/lib/utils";

type CompanyApprovalReviewDialogProps = {
  company: Company | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CompanyApprovalReviewDialog({
  company,
  open,
  onOpenChange,
}: CompanyApprovalReviewDialogProps) {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const approve = useApproveCompany();
  const reject = useRejectCompany();
  const [mode, setMode] = useState<"trial" | "active">("trial");
  const [notes, setNotes] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [rejectOpen, setRejectOpen] = useState(false);
  const [confirmApproveOpen, setConfirmApproveOpen] = useState(false);

  const { data: entitlements = [], isLoading: entitlementsLoading } = useCompanyEntitlements(
    company?.id ?? null,
    open && Boolean(company?.id),
  );

  const billingProfile = useMemo(() => {
    const raw = company?.billing_profile;
    return Array.isArray(raw) ? raw[0] ?? null : raw ?? null;
  }, [company?.billing_profile]);

  if (!company) return null;

  const pending = (company.approval_status ?? "approved") === "pending";

  async function handleApprove() {
    try {
      await approve.mutateAsync({
        companyId: company!.id,
        mode,
        notes: notes.trim() || null,
      });
      toast({ title: t("companies.approval.approveSuccess") });
      onOpenChange(false);
    } catch (error) {
      toast({
        title: t("companies.approval.approveFailed"),
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    }
  }

  async function handleReject() {
    if (!rejectReason.trim()) {
      toast({
        title: t("companies.approval.reasonRequired"),
        variant: "destructive",
      });
      return;
    }
    try {
      await reject.mutateAsync({
        companyId: company!.id,
        reason: rejectReason.trim(),
      });
      toast({ title: t("companies.approval.rejectSuccess") });
      setRejectOpen(false);
      onOpenChange(false);
    } catch (error) {
      toast({
        title: t("companies.approval.rejectFailed"),
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {pending
                ? t("companies.approval.reviewTitle")
                : t("companies.approval.viewTitle")}
              : {company.name}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 text-sm">
            <section className="space-y-2 rounded-xl border border-border/60 p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("companies.approval.companyInfo")}
              </h3>
              <dl className="grid gap-2 sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">{t("companies.table.businessType")}</dt>
                  <dd>{company.business_type || "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("companies.table.industry")}</dt>
                  <dd>{company.industry || "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("companies.table.owner")}</dt>
                  <dd>{company.contact_person || "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("companies.table.email")}</dt>
                  <dd dir="ltr">{company.contact_email || "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("companies.table.phone")}</dt>
                  <dd dir="ltr">{company.contact_phone || "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("companies.table.location")}</dt>
                  <dd>{formatCompanyLocation(company) || "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("companies.approval.legalName")}</dt>
                  <dd>{billingProfile?.legal_name || "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("companies.approval.taxId")}</dt>
                  <dd>{billingProfile?.tax_id || "—"}</dd>
                </div>
              </dl>
              {pending ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {t("companies.approval.awaitingApproval")}
                </p>
              ) : null}
              {company.approval_status === "rejected" && company.approval_rejection_reason ? (
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                  {t("companies.approval.rejectedReason")}: {company.approval_rejection_reason}
                </p>
              ) : null}
            </section>

            {pending ? (
              <section className="space-y-3 rounded-xl border border-border/60 p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("companies.approval.accountConfig")}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {(["trial", "active"] as const).map((value) => (
                    <Button
                      key={value}
                      type="button"
                      size="sm"
                      variant={mode === value ? "default" : "outline"}
                      className="rounded-xl"
                      onClick={() => setMode(value)}
                    >
                      {t(`companies.approval.mode.${value}`)}
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {mode === "trial"
                    ? t("companies.approval.trialHint")
                    : t("companies.approval.activeHint")}
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="approval-notes">{t("companies.approval.notes")}</Label>
                  <Textarea
                    id="approval-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                  />
                </div>
              </section>
            ) : null}

            <section className="space-y-2 rounded-xl border border-border/60 p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("companies.approval.featurePreview")}
              </h3>
              {entitlementsLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  {t("common.loading", { defaultValue: "Loading…" })}
                </div>
              ) : (
                <div className="max-h-48 space-y-1 overflow-y-auto text-xs">
                  {entitlements.slice(0, 24).map((row) => (
                    <div
                      key={row.feature_code}
                      className="flex items-center justify-between gap-2 rounded-lg border border-border/40 px-2 py-1.5"
                    >
                      <span>{row.label}</span>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 font-medium",
                          row.enabled
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {row.enabled ? t("companies.features.enabled") : t("companies.features.disabled")}
                        {row.source ? ` · ${String(row.source).toUpperCase()}` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">
                {t("companies.approval.featurePreviewHint")}
              </p>
            </section>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            {pending ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl border-rose-200 text-rose-700"
                  onClick={() => setRejectOpen(true)}
                  disabled={approve.isPending || reject.isPending}
                >
                  {t("companies.approval.reject")}
                </Button>
                <Button
                  type="button"
                  className="rounded-xl"
                  onClick={() => setConfirmApproveOpen(true)}
                  disabled={approve.isPending || reject.isPending}
                >
                  {approve.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    t("companies.approval.approve")
                  )}
                </Button>
              </>
            ) : (
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
                {t("buttons.close", { defaultValue: "Close" })}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmApproveOpen} onOpenChange={setConfirmApproveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("companies.approval.confirmApproveTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("companies.approval.confirmApproveDescription", {
                name: company.name,
                mode: t(`companies.approval.mode.${mode}`),
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("buttons.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void handleApprove().finally(() => setConfirmApproveOpen(false));
              }}
            >
              {t("companies.approval.approve")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("companies.approval.rejectTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-reason">{t("companies.approval.reason")}</Label>
            <Textarea
              id="reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={4}
              required
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRejectOpen(false)}>
              {t("buttons.cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleReject()}
              disabled={reject.isPending}
            >
              {reject.isPending ? <Loader2 className="size-4 animate-spin" /> : t("companies.approval.reject")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
