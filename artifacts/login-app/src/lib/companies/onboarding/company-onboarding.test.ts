import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCompanyOnboardingPayload,
  buildOwnerDisplayName,
  emptyCompanyOnboardingValues,
  shouldOpenFirstTimeCompanyOnboarding,
  validateCompanyOnboardingStep,
} from "./index.ts";

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
  });

  it("accepts a valid company step", () => {
    const errors = validateCompanyOnboardingStep(
      "company",
      emptyCompanyOnboardingValues({
        name: "Acme Clinic",
        legalName: "Acme Clinic LLC",
        businessType: "clinic",
        industry: "healthcare",
        contactEmail: "ops@acme.test",
        contactPhone: "+966500000000",
        website: "https://acme.test",
      }),
    );
    assert.deepEqual(errors, {});
  });

  it("rejects invalid website and email", () => {
    const errors = validateCompanyOnboardingStep(
      "company",
      emptyCompanyOnboardingValues({
        name: "Acme",
        legalName: "Acme LLC",
        businessType: "clinic",
        industry: "healthcare",
        contactEmail: "not-an-email",
        contactPhone: "123",
        website: "notaurl",
      }),
    );
    assert.equal(errors.contactEmail, "emailInvalid");
    assert.equal(errors.website, "websiteInvalid");
  });

  it("preserves unrelated values when validating another step", () => {
    const values = emptyCompanyOnboardingValues({
      name: "Keep Me",
      country: "",
      city: "",
    });
    const errors = validateCompanyOnboardingStep("business", values);
    assert.equal(errors.country, "required");
    assert.equal(values.name, "Keep Me");
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
        contactPhone: "+9665",
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
        ownerPhone: "050",
        ownerJobTitle: "Owner",
      }),
      { mode: "first_time" },
    );

    assert.equal(payload.name, "Acme");
    assert.equal(payload.website, "https://www.acme.test");
    assert.equal(payload.commercial_registration, "CR-9");
    assert.equal(payload.owner_display_name, "Omar Ali");
    assert.equal(payload.owner_phone, "050");
    assert.equal(payload.subscription_plan, "Basic");
  });

  it("falls back owner_phone to contact_phone when owner phone is blank", () => {
    const payload = buildCompanyOnboardingPayload(
      emptyCompanyOnboardingValues({
        name: "Acme",
        legalName: "Acme LLC",
        businessType: "clinic",
        industry: "healthcare",
        contactEmail: "ops@acme.test",
        contactPhone: "+966500000000",
        ownerFirstName: "Omar",
        ownerLastName: "Ali",
        ownerPhone: "  ",
      }),
      { mode: "first_time" },
    );

    assert.equal(payload.owner_phone, "+966500000000");
    assert.equal(payload.contact_phone, "+966500000000");
  });
});

describe("buildOwnerDisplayName", () => {
  it("joins first and last name", () => {
    assert.equal(buildOwnerDisplayName("Omar", "Ali", "fallback"), "Omar Ali");
  });
});
