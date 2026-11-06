import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import QRCode from "qrcode";
import { resolveMobileDownload } from "@/lib/mobile/mobile-download";

export function MobileAppDownload() {
  const { t } = useTranslation("common");
  const model = resolveMobileDownload({
    androidApkUrl: import.meta.env.VITE_VALUEOR_ANDROID_APK_URL as string | undefined,
    androidVersion: import.meta.env.VITE_VALUEOR_ANDROID_VERSION as string | undefined,
  });
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    if (!model.showQr || !model.androidUrl) {
      setQr(null);
      return;
    }
    let cancelled = false;
    void QRCode.toDataURL(model.androidUrl, { margin: 1, width: 160 }).then((url) => {
      if (!cancelled) setQr(url);
    }).catch(() => {
      if (!cancelled) setQr(null);
    });
    return () => {
      cancelled = true;
    };
  }, [model.androidUrl, model.showQr]);

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-start" data-testid="mobile-app-download">
      <h2 className="text-sm font-semibold text-slate-800">{t("auth.login.mobileApps.title")}</h2>
      <div className="mt-3 space-y-2 text-sm text-slate-600">
        <h3 className="font-medium text-slate-700">{t("auth.login.mobileApps.androidTitle")}</h3>
        {model.androidStatus === "ready" && model.androidUrl ? (
          <>
            <a className="font-semibold text-[#0D9488]" href={model.androidUrl}>
              {t("auth.login.mobileApps.androidDownload")}
            </a>
            {model.androidVersion ? <p>{t("auth.login.mobileApps.version", { version: model.androidVersion })}</p> : null}
            {qr ? <img alt={t("auth.login.mobileApps.qrAlt")} className="h-40 w-40" src={qr} /> : null}
            <p>{t("auth.login.mobileApps.androidInstall")}</p>
          </>
        ) : (
          <p>{t("auth.login.mobileApps.androidPending")}</p>
        )}
        <h3 className="font-medium text-slate-700">{t("auth.login.mobileApps.iosTitle")}</h3>
        <p>{t("auth.login.mobileApps.iosPending")}</p>
      </div>
    </section>
  );
}
