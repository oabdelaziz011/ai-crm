import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  acquisitionFieldsForSourceChange,
  buildCompanyOnboardingPayload,
  buildOwnerDisplayName,
  COMPANY_ACQUISITION_LEGACY_SOURCES,
  COMPANY_ACQUISITION_SOCIAL_PLATFORMS,
  COMPANY_ACQUISITION_SOURCES,
  companyOnboardingValuesFromPayload,
  emptyCompanyOnboardingValues,
  isCompanyAcquisitionKnownSource,
  isCompanyAcquisitionLegacySource,
  isCompanyAcquisitionSource,
  ONBOARDING_PHONE_DEFAULT_REGION,
  parseCompanyAcquisitionFormFields,
  resolveOnboardingPhoneE164,
  shouldOpenFirstTimeCompanyOnboarding,
  syncOwnerFromAccount,
  validateCompanyOnboardingStep,
} from "./index.ts";

const baseCompany = {
  name: "Acme",
  legalName: "Acme LLC",
  businessType: "clinic" as const,
  industry: "healthcare" as const,
  contactEmail: "ops@acme.test",
  contactPhone: "1022222222",
  contactPhoneRegion: "EG",
  acquisitionSource: "linkedin" as const,
};

function splitFullName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0]!, last: parts[0]! };
  return { first: parts[0]!, last: parts.slice(1).join(" ") };
}

describe("shouldOpenFirstTimeCompanyOnboarding", () => {
  it("opens for authenticated users without a company", () => {
    assert.equal(
      shouldOpenFirstTimeCompanyOnboarding({
        isAuthLoading: false,
        isAuthenticated: true,
        companyId: null,
        isSuperAdmin: false,
      }),
      true,
    );
  });

  it("does not open when the user already belongs to a company", () => {
    assert.equal(
      shouldOpenFirstTimeCompanyOnboarding({
        isAuthLoading: false,
        isAuthenticated: true,
        companyId: "company-1",
        isSuperAdmin: false,
      }),
      false,
    );
  });

  it("does not open for super admins", () => {
    assert.equal(
      shouldOpenFirstTimeCompanyOnboarding({
        isAuthLoading: false,
        isAuthenticated: true,
        companyId: null,
        isSuperAdmin: true,
      }),
      false,
    );
  });

  it("does not open while auth is loading", () => {
    assert.equal(
      shouldOpenFirstTimeCompanyOnboarding({
        isAuthLoading: true,
        isAuthenticated: true,
        companyId: null,
        isSuperAdmin: false,
      }),
      false,
    );
  });

  it("does not open while identity (profile/company) is still resolving", () => {
    assert.equal(
      shouldOpenFirstTimeCompanyOnboarding({
        isAuthLoading: false,
        isIdentityPending: true,
        isAuthenticated: true,
        companyId: null,
        isSuperAdmin: false,
      }),
      false,
    );
  });
});

describe("account vs company phone independence", () => {
  it("does not copy account phone into empty company contactPhone on sync", () => {
    const values = emptyCompanyOnboardingValues({
      ...baseCompany,
      contactPhone: "",
      contactPhoneRegion: "EG",
      ownerPhone: "",
      ownerPhoneRegion: "EG",
    });
    const synced = syncOwnerFromAccount(
      values,
      {
        fullName: "Omar Ali",
        email: "omar@acme.test",
        phone: "1011111111",
        phoneRegion: "EG",
        jobTitle: "Owner",
      },
      splitFullName,
      buildOwnerDisplayName,
    );

    assert.equal(synced.ownerPhone, "1011111111");
    assert.equal(synced.ownerPhoneRegion, "EG");
    assert.equal(synced.contactPhone, "", "company phone must stay empty");
    assert.equal(synced.contactPhoneRegion, "EG");
    assert.notEqual(synced.contactPhone, synced.ownerPhone);
  });

  it("keeps distinct account and company phones through payload", () => {
    const values = emptyCompanyOnboardingValues({
      ...baseCompany,
      contactPhone: "1022222222",
      contactPhoneRegion: "EG",
      ownerPhone: "1011111111",
      ownerPhoneRegion: "EG",
      ownerFirstName: "Omar",
      ownerLastName: "Ali",
    });
    const payload = buildCompanyOnboardingPayload(values, { mode: "first_time" });

    assert.equal(payload.owner_phone, "+201011111111");
    assert.equal(payload.contact_phone, "+201022222222");
    assert.notEqual(payload.owner_phone, payload.contact_phone);
  });

  it("does not fall back owner_phone to company contact_phone", () => {
    const payload = buildCompanyOnboardingPayload(
      emptyCompanyOnboardingValues({
        ...baseCompany,
        contactPhone: "1099999999",
        contactPhoneRegion: "EG",
        ownerPhone: "",
        ownerPhoneRegion: "EG",
        ownerFirstName: "Omar",
        ownerLastName: "Ali",
      }),
      { mode: "first_time" },
    );

    assert.equal(payload.contact_phone, "+201099999999");
    assert.equal(payload.owner_phone, null);
  });

  it("preserves independent regions across sync", () => {
    const values = emptyCompanyOnboardingValues({
      ...baseCompany,
      contactPhone: "501234567",
      contactPhoneRegion: "SA",
      ownerPhone: "",
      ownerPhoneRegion: "EG",
    });
    const synced = syncOwnerFromAccount(
      values,
      {
        fullName: "Omar Ali",
        email: "omar@acme.test",
        phone: "501234567",
        phoneRegion: "AE",
        jobTitle: "Owner",
      },
      splitFullName,
      buildOwnerDisplayName,
    );

    assert.equal(synced.ownerPhoneRegion, "AE");
    assert.equal(synced.contactPhoneRegion, "SA");
    assert.equal(synced.contactPhone, "501234567");
  });

  it("normalizes pasted E.164 without duplicating country code", () => {
    assert.equal(
      resolveOnboardingPhoneE164("+201011111111", "EG"),
      "+201011111111",
    );
    assert.equal(
      resolveOnboardingPhoneE164("+201022222222", null),
      "+201022222222",
    );
  });

  it("round-trips pending payload without mixing phones", () => {
    const payload = buildCompanyOnboardingPayload(
      emptyCompanyOnboardingValues({
        ...baseCompany,
        contactPhone: "1022222222",
        contactPhoneRegion: "EG",
        ownerPhone: "1011111111",
        ownerPhoneRegion: "EG",
        ownerFirstName: "Omar",
        ownerLastName: "Ali",
      }),
      { mode: "first_time" },
    );
    const restored = companyOnboardingValuesFromPayload(payload);
    assert.equal(restored.contactPhone, "+201022222222");
    assert.equal(restored.ownerPhone, "+201011111111");
    assert.notEqual(restored.contactPhone, restored.ownerPhone);
  });
});

describe("validateCompanyOnboardingStep", () => {
  it("requires company identity fields", () => {
    const errors = validateCompanyOnboardingStep(
      "company",
      emptyCompanyOnboardingValues(),
    );
    assert.equal(errors.name, "required");
    assert.equal(errors.legalName, "required");
    assert.equal(errors.businessType, "required");
    assert.equal(errors.industry, "required");
    assert.equal(errors.contactEmail, "required");
    assert.equal(errors.contactPhone, "required");
    assert.equal(errors.acquisitionSource, "required");
  });

  it("accepts a valid company step with LinkedIn", () => {
    const errors = validateCompanyOnboardingStep(
      "company",
      emptyCompanyOnboardingValues({
        ...baseCompany,
        website: "https://acme.test",
      }),
    );
    assert.deepEqual(errors, {});
  });

  it("rejects invalid company phone", () => {
    const errors = validateCompanyOnboardingStep(
      "company",
      emptyCompanyOnboardingValues({
        ...baseCompany,
        contactPhone: "12",
        contactPhoneRegion: "EG",
      }),
    );
    assert.equal(errors.contactPhone, "invalidPhone");
  });

  it("rejects invalid website and email", () => {
    const errors = validateCompanyOnboardingStep(
      "company",
      emptyCompanyOnboardingValues({
        ...baseCompany,
        contactEmail: "not-an-email",
        website: "notaurl",
        acquisitionSource: "referral",
      }),
    );
    assert.equal(errors.contactEmail, "emailInvalid");
    assert.equal(errors.website, "websiteInvalid");
  });

  it("accepts every active top-level source with required nested detail", () => {
    for (const source of COMPANY_ACQUISITION_SOURCES) {
      const values = emptyCompanyOnboardingValues({
        ...baseCompany,
        acquisitionSource: source,
        acquisitionSubSource: source === "social_media" ? "facebook" : "",
        acquisitionSourceDetail: source === "other" ? "Friend" : "",
      });
      const errors = validateCompanyOnboardingStep("company", values);
      assert.deepEqual(errors, {}, `expected ${source} to be valid`);
    }
  });

  it("rejects retired top-level YouTube / Video and Advertisement for new registrations", () => {
    for (const legacy of COMPANY_ACQUISITION_LEGACY_SOURCES) {
      const errors = validateCompanyOnboardingStep(
        "company",
        emptyCompanyOnboardingValues({
          ...baseCompany,
          acquisitionSource: legacy,
          acquisitionSubSource: legacy === "advertisement" ? "google" : "",
        }),
      );
      assert.equal(
        errors.acquisitionSource,
        "required",
        `${legacy} must not be a valid new top-level selection`,
      );
    }
    assert.equal(isCompanyAcquisitionSource("youtube_video"), false);
    assert.equal(isCompanyAcquisitionSource("advertisement"), false);
    assert.equal(isCompanyAcquisitionLegacySource("youtube_video"), true);
    assert.equal(isCompanyAcquisitionLegacySource("advertisement"), true);
    assert.ok(!COMPANY_ACQUISITION_SOURCES.includes("youtube_video" as never));
    assert.ok(!COMPANY_ACQUISITION_SOURCES.includes("advertisement" as never));
  });

  it("validates Social Media nested platforms including YouTube", () => {
    for (const platform of COMPANY_ACQUISITION_SOCIAL_PLATFORMS) {
      const errors = validateCompanyOnboardingStep(
        "company",
        emptyCompanyOnboardingValues({
          ...baseCompany,
          acquisitionSource: "social_media",
          acquisitionSubSource: platform,
          acquisitionSourceDetail: platform === "other" ? "Threads" : "",
        }),
      );
      assert.deepEqual(errors, {}, `social + ${platform}`);
    }
    assert.ok(COMPANY_ACQUISITION_SOCIAL_PLATFORMS.includes("youtube"));
  });

  it("parses legacy advertisement and youtube_video records for display without crashing", () => {
    assert.equal(isCompanyAcquisitionKnownSource("advertisement"), true);
    assert.equal(isCompanyAcquisitionKnownSource("youtube_video"), true);

    const adParsed = parseCompanyAcquisitionFormFields({
      source: "advertisement",
      detail: "google",
    });
    assert.equal(adParsed.acquisitionSubSource, "google");
    assert.equal(adParsed.acquisitionSourceDetail, "");

    const ytParsed = parseCompanyAcquisitionFormFields({
      source: "youtube_video",
      detail: null,
    });
    assert.equal(ytParsed.acquisitionSubSource, "");
    assert.equal(ytParsed.acquisitionSourceDetail, "");

    const socialYt = parseCompanyAcquisitionFormFields({
      source: "social_media",
      detail: "youtube",
    });
    assert.equal(socialYt.acquisitionSubSource, "youtube");
  });

  it("preserves acquisition and phone fields when validating another step", () => {
    const values = emptyCompanyOnboardingValues({
      name: "Keep Me",
      contactPhone: "1022222222",
      contactPhoneRegion: "EG",
      ownerPhone: "1011111111",
      ownerPhoneRegion: "AE",
      acquisitionSource: "social_media",
      acquisitionSubSource: "instagram",
      country: "",
      city: "",
    });
    const errors = validateCompanyOnboardingStep("business", values);
    assert.equal(errors.country, "required");
    assert.equal(values.contactPhone, "1022222222");
    assert.equal(values.ownerPhone, "1011111111");
    assert.equal(values.ownerPhoneRegion, "AE");
  });
});

describe("acquisition state reset + detail resolve", () => {
  it("clears nested fields when top-level source changes", () => {
    assert.deepEqual(acquisitionFieldsForSourceChange("linkedin"), {
      acquisitionSource: "linkedin",
      acquisitionSubSource: "",
      acquisitionSourceDetail: "",
    });
  });
});

describe("buildCompanyOnboardingPayload", () => {
  it("maps wizard values into the RPC payload", () => {
    const payload = buildCompanyOnboardingPayload(
      emptyCompanyOnboardingValues({
        name: " Acme ",
        legalName: "Acme LLC",
        businessType: "clinic",
        industry: "healthcare",
        contactEmail: "ops@acme.test",
        contactPhone: "1022222222",
        contactPhoneRegion: "EG",
        website: "www.acme.test",
        taxId: "123",
        commercialRegistration: "CR-9",
        country: "SA",
        city: "Riyadh",
        address: "King Fahd Rd",
        timezone: "Asia/Riyadh",
        currency: "SAR",
        ownerFirstName: "Omar",
        ownerLastName: "Ali",
        ownerDisplayName: "",
        ownerEmail: "omar@acme.test",
        ownerPhone: "1011111111",
        ownerPhoneRegion: "EG",
        ownerJobTitle: "Owner",
        acquisitionSource: "linkedin",
      }),
      { mode: "first_time" },
    );

    assert.equal(payload.name, "Acme");
    assert.equal(payload.website, "https://www.acme.test");
    assert.equal(payload.commercial_registration, "CR-9");
    assert.equal(payload.owner_display_name, "Omar Ali");
    assert.equal(payload.owner_phone, "+201011111111");
    assert.equal(payload.contact_phone, "+201022222222");
    assert.equal(payload.subscription_plan, "Basic");
    assert.equal(payload.acquisition_source, "linkedin");
  });
});

describe("buildOwnerDisplayName", () => {
  it("joins first and last name", () => {
    assert.equal(buildOwnerDisplayName("Omar", "Ali", "fallback"), "Omar Ali");
  });
});

describe("ONBOARDING_PHONE_DEFAULT_REGION", () => {
  it("defaults to Egypt", () => {
    assert.equal(ONBOARDING_PHONE_DEFAULT_REGION, "EG");
  });
});
