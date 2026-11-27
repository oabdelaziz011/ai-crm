import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import QRCode from "qrcode";
import { resolveMobileDownload } from "@/lib/mobile/mobile-download";

function AndroidIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      aria-hidden
      focusable="false"
    >
      <path
        fill="#3DDC84"
        d="M17.6 9.48l1.84-3.18a.5.5 0 0 0-.18-.68.5.5 0 0 0-.68.18l-1.86 3.22A7.9 7.9 0 0 0 12 8c-1.68 0-3.22.52-4.72 1.02L5.42 5.8a.5.5 0 0 0-.68-.18.5.5 0 0 0-.18.68L6.4 9.48C3.92 11.08 2.4 13.7 2.4 16.8v.6c0 .66.54 1.2 1.2 1.2h16.8c.66 0 1.2-.54 1.2-1.2v-.6c0-3.1-1.52-5.72-4-7.32zM8.4 14.4a1.2 1.2 0 1 1 0-2.4 1.2 1.2 0 0 1 0 2.4zm7.2 0a1.2 1.2 0 1 1 0-2.4 1.2 1.2 0 0 1 0 2.4z"
      />
    </svg>
  );
}

function AppleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      aria-hidden
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M16.37 12.66c.03 2.74 2.4 3.65 2.43 3.67-.02.06-.38 1.3-1.25 2.57-.75 1.1-1.53 2.2-2.76 2.22-1.21.02-1.6-.72-2.98-.72-1.39 0-1.82.7-2.97.74-1.19.04-2.1-1.19-2.86-2.28-1.55-2.25-2.74-6.36-1.15-9.13.79-1.37 2.2-2.24 3.73-2.26 1.16-.02 2.26.78 2.98.78.71 0 2.03-.97 3.43-.82.58.02 2.22.24 3.27 1.78-.08.05-1.95 1.14-1.87 3.45zM14.7 5.3c.63-.76 1.05-1.82.93-2.87-0.9.04-1.99.6-2.64 1.36-.58.67-1.09 1.74-.95 2.77 1.01.08 2.03-.51 2.66-1.26z"
      />
    </svg>
  );
}

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
    void QRCode.toDataURL(model.androidUrl, { margin: 1, width: 160 })
      .then((url) => {
        if (!cancelled) setQr(url);
      })
      .catch(() => {
        if (!cancelled) setQr(null);
      });
    return () => {
      cancelled = true;
    };
  }, [model.androidUrl, model.showQr]);

  return (
    <section
      className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-start"
      data-testid="mobile-app-download"
    >
      <h2 className="text-[11px] font-semibold text-slate-800">{t("auth.login.mobileApps.title")}</h2>
      <div className="mt-1.5 grid grid-cols-2 gap-1.5 text-[10px] leading-snug text-slate-600">
        <div className="min-w-0 rounded-lg border border-slate-200/80 bg-white/80 p-2" data-testid="mobile-app-android">
          <div className="flex items-center gap-1.5">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white shadow-sm">
              <AndroidIcon className="size-3.5" />
            </span>
            <h3 className="truncate text-[11px] font-medium text-slate-700">
              {t("auth.login.mobileApps.androidTitle")}
            </h3>
          </div>
          <div className="mt-1 space-y-0.5">
            {model.androidStatus === "ready" && model.androidUrl ? (
              <>
                <a className="font-semibold text-[#0D9488]" href={model.androidUrl}>
                  {t("auth.login.mobileApps.androidDownload")}
                </a>
                {model.androidVersion ? (
                  <p>{t("auth.login.mobileApps.version", { version: model.androidVersion })}</p>
                ) : null}
                {qr ? (
                  <img
                    alt={t("auth.login.mobileApps.qrAlt")}
                    className="h-12 w-12 rounded-md"
                    src={qr}
                  />
                ) : null}
                <p className="line-clamp-2">{t("auth.login.mobileApps.androidInstall")}</p>
              </>
            ) : (
              <p className="line-clamp-2">{t("auth.login.mobileApps.androidPending")}</p>
            )}
          </div>
        </div>

        <div className="min-w-0 rounded-lg border border-slate-200/80 bg-white/80 p-2" data-testid="mobile-app-ios">
          <div className="flex items-center gap-1.5">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-900 shadow-sm">
              <AppleIcon className="size-3" />
            </span>
            <h3 className="truncate text-[11px] font-medium text-slate-700">
              {t("auth.login.mobileApps.iosTitle")}
            </h3>
          </div>
          <div className="mt-1">
            <p className="line-clamp-2">{t("auth.login.mobileApps.iosPending")}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
