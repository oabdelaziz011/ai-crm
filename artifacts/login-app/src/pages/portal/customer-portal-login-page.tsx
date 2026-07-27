import { useState } from "react";
import { Link, useRoute } from "wouter";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { usePortalAuthVerify, usePortalProfile } from "@/lib/customer-portal/hooks";
import { getCustomerPortalServices } from "@/lib/customer-portal";
import { portalAuthRateLimiter } from "@/lib/customer-portal/security/portal-rate-limiter";
import { toast } from "sonner";

type CustomerPortalLoginPageProps = Record<string, never>;

export function CustomerPortalLoginPage(_props: CustomerPortalLoginPageProps) {
  const [, params] = useRoute("/portal/:slug/login");
  const slug = params?.slug ?? "";
  const { t } = useTranslation("common");
  const { data: profile } = usePortalProfile(slug);
  const verify = usePortalAuthVerify();

  const [phone, setPhone] = useState("");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState("");

  const startOtp = async () => {
    if (!profile?.companyId || !portalAuthRateLimiter.isAllowed(phone)) {
      toast.error(t("customerPortal.rateLimited"));
      return;
    }
    try {
      const challenge = await getCustomerPortalServices().auth.startChallenge({
        companyId: profile.companyId,
        method: "otp",
        destination: phone,
      });
      setChallengeId(challenge.challengeId);
      toast.success(t("customerPortal.otpSent"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("customerPortal.loginFailed"));
    }
  };

  const verifyOtp = () => {
    if (!challengeId) return;
    verify.mutate(
      { challengeId, code },
      {
        onSuccess: () => toast.success(t("customerPortal.loginSuccess")),
        onError: () => toast.error(t("customerPortal.loginFailed")),
      },
    );
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6 rounded-2xl border border-white/10 p-6">
        <h1 className="text-xl font-bold">{t("customerPortal.loginTitle")}</h1>
        {!challengeId ? (
          <>
            <div>
              <Label htmlFor="login-phone">{t("customerPortal.phone")}</Label>
              <Input id="login-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <Button className="w-full" onClick={() => void startOtp()}>{t("customerPortal.sendOtp")}</Button>
          </>
        ) : (
          <>
            <Label>{t("customerPortal.enterOtp")}</Label>
            <InputOTP maxLength={6} value={code} onChange={setCode}>
              <InputOTPGroup>
                {Array.from({ length: 6 }).map((_, i) => (
                  <InputOTPSlot key={i} index={i} />
                ))}
              </InputOTPGroup>
            </InputOTP>
            <Button className="w-full" onClick={verifyOtp} disabled={verify.isPending || code.length < 6}>
              {t("customerPortal.verify")}
            </Button>
          </>
        )}
        <Link href={`/book/${slug}`}>
          <Button variant="ghost" className="w-full">{t("buttons.back")}</Button>
        </Link>
      </div>
    </div>
  );
}
