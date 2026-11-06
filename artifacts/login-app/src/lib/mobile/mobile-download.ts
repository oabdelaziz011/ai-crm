export type MobileDownloadConfig = {
  androidApkUrl?: string | null;
  androidVersion?: string | null;
};

export type MobileDownloadModel = {
  androidStatus: "ready" | "pending";
  androidUrl: string | null;
  androidVersion: string | null;
  showQr: boolean;
  iosStatus: "app_store_pending";
};

const HTTPS_URL = /^https:\/\/[a-z0-9.-]+(?::\d+)?\/.+\.apk(?:\?.*)?$/i;

export function resolveMobileDownload(config: MobileDownloadConfig | null | undefined): MobileDownloadModel {
  const url = (config?.androidApkUrl ?? "").trim();
  const version = (config?.androidVersion ?? "").trim();
  const ready = HTTPS_URL.test(url);
  return {
    androidStatus: ready ? "ready" : "pending",
    androidUrl: ready ? url : null,
    androidVersion: version || null,
    showQr: ready,
    iosStatus: "app_store_pending",
  };
}
