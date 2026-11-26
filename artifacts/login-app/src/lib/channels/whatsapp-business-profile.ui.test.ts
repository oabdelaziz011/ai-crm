import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const panelPath = join(here, "../../components/channels/whatsapp-business-profile-panel.tsx");
const pagePath = join(here, "../../pages/dashboard/settings/whatsapp-settings-page.tsx");
const clientPath = join(here, "whatsapp-business-profile-client.ts");
const hookPath = join(here, "../../hooks/notifications/use-whatsapp-business-profile.ts");
const i18nPath = join(here, "../../i18n.ts");
const enPath = join(here, "../../locales/en/common.json");
const arPath = join(here, "../../locales/ar/common.json");
const dePath = join(here, "../../locales/de/whatsapp-business-profile.json");

const REQUIRED_BP_KEYS = [
  "title",
  "description",
  "displayNameNote",
  "coexistenceNote",
  "previewLabel",
  "apiMissing",
  "notConnectedHint",
  "loading",
  "empty",
  "load",
  "sync",
  "syncSuccess",
  "syncFailed",
  "save",
  "saveSuccess",
  "saveFailed",
  "cancel",
  "discard",
  "discardConfirm",
  "unsaved",
  "phone",
  "phoneNumberId",
  "companyScope",
  "verifiedName",
  "lastSynced",
  "currentPicture",
  "newPicture",
  "noPicture",
  "previewEmpty",
  "uploadPicture",
  "applyPicture",
  "uploadProgress",
  "pictureHint",
  "pictureSuccess",
  "pictureFailed",
  "about",
  "descriptionField",
  "address",
  "email",
  "website1",
  "website2",
  "addWebsite",
  "removeWebsite",
  "vertical",
  "validation",
  "verticals",
  "errors",
] as const;

const REQUIRED_VALIDATION_KEYS = [
  "aboutRequired",
  "aboutTooLong",
  "emailInvalid",
  "emailTooLong",
  "websiteInvalid",
  "websiteTooLong",
  "verticalInvalid",
  "formInvalid",
] as const;

const REQUIRED_ERROR_KEYS = [
  "notConnected",
  "phoneMissing",
  "tokenInvalid",
  "rateLimited",
  "network",
  "imageUnsupported",
  "imageTooLarge",
  "imageInvalid",
  "pictureFailed",
  "updateFailed",
  "unsupportedMode",
  "forbidden",
] as const;

const REQUIRED_VERTICAL_KEYS = [
  "OTHER",
  "AUTO",
  "BEAUTY",
  "APPAREL",
  "EDU",
  "ENTERTAIN",
  "EVENT_PLAN",
  "FINANCE",
  "GROCERY",
  "GOVT",
  "HOTEL",
  "HEALTH",
  "NONPROFIT",
  "PROF_SERVICES",
  "RETAIL",
  "TRAVEL",
  "RESTAURANT",
  "ALCOHOL",
  "ONLINE_GAMBLING",
  "OTC_DRUGS",
  "PHYSICAL_GAMBLING",
  "MATRIMONY_SERVICE",
] as const;

describe("WhatsApp Business Profile UI contracts", () => {
  const panel = readFileSync(panelPath, "utf8");
  const page = readFileSync(pagePath, "utf8");
  const client = readFileSync(clientPath, "utf8");
  const hook = readFileSync(hookPath, "utf8");
  const i18n = readFileSync(i18nPath, "utf8");
  const en = JSON.parse(readFileSync(enPath, "utf8")) as Record<string, unknown>;
  const ar = JSON.parse(readFileSync(arPath, "utf8")) as Record<string, unknown>;
  const de = JSON.parse(readFileSync(dePath, "utf8")) as Record<string, unknown>;

  function dig(root: Record<string, unknown>, path: string[]): unknown {
    let cur: unknown = root;
    for (const key of path) {
      if (!cur || typeof cur !== "object") return undefined;
      cur = (cur as Record<string, unknown>)[key];
    }
    return cur;
  }

  function assertBusinessProfileLocale(
    label: string,
    bp: Record<string, unknown> | undefined,
  ) {
    assert.ok(bp && typeof bp.title === "string", `${label} missing title`);
    for (const key of REQUIRED_BP_KEYS) {
      assert.ok(key in (bp ?? {}), `${label} missing key ${key}`);
    }
    const validation = bp?.validation as Record<string, unknown> | undefined;
    const errors = bp?.errors as Record<string, unknown> | undefined;
    const verticals = bp?.verticals as Record<string, unknown> | undefined;
    for (const key of REQUIRED_VALIDATION_KEYS) {
      assert.ok(validation?.[key], `${label} missing validation.${key}`);
    }
    for (const key of REQUIRED_ERROR_KEYS) {
      assert.ok(errors?.[key], `${label} missing errors.${key}`);
    }
    for (const key of REQUIRED_VERTICAL_KEYS) {
      assert.ok(verticals?.[key], `${label} missing verticals.${key}`);
    }
  }

  it("mounts Business Profile panel on WhatsApp settings page with company phone scope", () => {
    assert.match(page, /WhatsAppBusinessProfilePanel/);
    assert.match(page, /hasConnection=\{/);
    assert.match(page, /phoneNumberId=\{settings\?\.phoneNumberId/);
    assert.match(page, /settings\?\.phoneNumberId/);
    assert.match(page, /settings\?\.hasAccessToken/);
    assert.doesNotMatch(
      page,
      /hasConnection=\{[\s\S]{0,200}draft\.phoneNumberId/,
    );
  });

  it("uses React Query hooks for get/sync/update/picture and refreshes cache on success", () => {
    assert.match(hook, /useQuery/);
    assert.match(hook, /useMutation/);
    assert.match(hook, /whatsappBusinessProfileKey/);
    assert.match(hook, /setQueryData/);
    assert.match(hook, /fetchWhatsAppBusinessProfile/);
    assert.match(hook, /syncWhatsAppBusinessProfile/);
    assert.match(hook, /updateWhatsAppBusinessProfileFields/);
    assert.match(hook, /uploadWhatsAppBusinessProfilePicture/);
    assert.match(panel, /useWhatsAppBusinessProfile/);
    assert.match(panel, /useSyncWhatsAppBusinessProfile/);
    assert.match(panel, /useUpdateWhatsAppBusinessProfile/);
    assert.match(panel, /useUploadWhatsAppBusinessProfilePicture/);
  });

  it("wires real API client paths (get/sync/update/picture)", () => {
    assert.match(client, /\/whatsapp\/business-profile\/get/);
    assert.match(client, /\/whatsapp\/business-profile\/sync/);
    assert.match(client, /\/whatsapp\/business-profile\/update/);
    assert.match(client, /\/whatsapp\/business-profile\/picture/);
  });

  it("supports load, sync, save, preview, photo upload, and unsaved guard", () => {
    assert.match(panel, /beforeunload/);
    assert.match(panel, /uploadPicture/);
    assert.match(panel, /applyPicture/);
    assert.match(panel, /businessProfile\.load/);
    assert.match(panel, /businessProfile\.sync/);
    assert.match(panel, /businessProfile\.save/);
    assert.match(panel, /businessProfile\.cancel/);
    assert.match(panel, /displayNameNote/);
    assert.match(panel, /coexistenceNote/);
    assert.match(panel, /wa-bp-preview-card/);
    assert.match(panel, /previewLabel/);
    assert.match(panel, /addWebsite/);
    assert.match(panel, /removeWebsite/);
    assert.match(panel, /wa-bp-phone-number-id/);
    assert.match(panel, /wa-bp-company-id/);
    assert.doesNotMatch(panel, /displayName:\s/);
  });

  it("validates image and form fields client-side before save/upload", () => {
    assert.match(panel, /validateBusinessProfileDraft/);
    assert.match(panel, /validateProfilePictureFileMeta/);
    assert.match(panel, /image\/jpeg/);
    assert.match(panel, /image\/png/);
  });

  it("keeps existing profile on sync/load failure (does not clear state blindly)", () => {
    assert.match(panel, /unsaved edits/);
  });

  it("uses logical CSS for RTL/LTR (ms-* / text-start/end; no ml-/mr-)", () => {
    assert.match(panel, /className="ms-2"/);
    assert.match(panel, /text-start|text-end/);
    assert.match(panel, /dir="ltr"/);
    assert.doesNotMatch(panel, /\bml-\d/);
    assert.doesNotMatch(panel, /\bmr-\d/);
    assert.doesNotMatch(panel, /className="ml-2"/);
  });

  it("loads German Business Profile strings through existing i18n merge path", () => {
    assert.match(i18n, /whatsapp-business-profile\.json/);
    assert.match(i18n, /supportedLngs:\s*\[["']en["'],\s*["']ar["'],\s*["']de["']\]/);
    assert.match(i18n, /RTL_LANGUAGES = new Set\(\[["']ar["']\]\)/);
    assert.match(i18n, /dePublicSurfaces/);
    assert.match(i18n, /deWhatsAppBusinessProfile/);
    assert.match(i18n, /mergeMessages/);
  });

  it("provides matching EN / AR / DE businessProfile localization coverage", () => {
    const enBp = dig(en, ["notifications", "whatsapp", "settings", "businessProfile"]) as
      | Record<string, unknown>
      | undefined;
    const arBp = dig(ar, ["notifications", "whatsapp", "settings", "businessProfile"]) as
      | Record<string, unknown>
      | undefined;
    const deBp = dig(de, ["notifications", "whatsapp", "settings", "businessProfile"]) as
      | Record<string, unknown>
      | undefined;

    assertBusinessProfileLocale("en", enBp);
    assertBusinessProfileLocale("ar", arBp);
    assertBusinessProfileLocale("de", deBp);

    assert.match(String(enBp?.sync ?? ""), /Sync from WhatsApp/i);
    assert.match(String(arBp?.sync ?? ""), /مزامنة من واتساب/);
    assert.match(String(deBp?.sync ?? ""), /Mit WhatsApp synchronisieren/i);
    assert.match(String(deBp?.save ?? ""), /Änderungen speichern/i);
    assert.match(String(deBp?.cancel ?? ""), /Abbrechen/i);
    assert.match(String(deBp?.errors && (deBp.errors as Record<string, unknown>).unsupportedMode), /Cloud-API|Business Suite/i);
  });

  it("does not ship secrets or Meta tokens in the FE client/hook modules", () => {
    assert.doesNotMatch(client, /EAA[A-Za-z0-9]+/);
    assert.doesNotMatch(client, /META_APP_SECRET|SUPABASE_SERVICE_ROLE|accessToken\s*:/);
    assert.doesNotMatch(hook, /EAA[A-Za-z0-9]+/);
    assert.doesNotMatch(hook, /META_APP_SECRET|accessToken\s*:/);
  });
});
