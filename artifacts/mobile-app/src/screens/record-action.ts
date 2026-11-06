import { postMobileRecord, type MobileRecordResult } from "../data/mobile-records";
import { presentClientCode } from "../i18n/present";
import type { useAppSession } from "../providers";

type App = ReturnType<typeof useAppSession>;

export async function submitRecord(app: App, action: Record<string, unknown>): Promise<MobileRecordResult> {
  const token = await app.accessToken();
  const companyId = app.session?.company?.id;
  if (!token || !app.apiUrl || !app.instanceHostname || !companyId) {
    return { ok: false, status: 401, code: "session_expired", message: app.t("sessionExpired") };
  }
  const result = await postMobileRecord({
    apiUrl: app.apiUrl,
    token,
    instanceHostname: app.instanceHostname,
    sessionCompanyId: companyId,
    action,
  });
  if (!result.ok && result.code === "session_expired") await app.signOut();
  return result;
}

export function recordMessage(app: App, result: MobileRecordResult, success: string): string {
  if (result.ok) return success;
  return presentClientCode(app.language, result.code) ?? result.message;
}
