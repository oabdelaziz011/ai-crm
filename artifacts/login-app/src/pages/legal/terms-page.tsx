import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { getPrivacyContactEmail } from "@/lib/legal/privacy-contact";
import { LegalList, LegalPageLayout, LegalSection } from "@/pages/legal/legal-page-layout";

export default function TermsPage() {
  const { t } = useTranslation("common");
  const email = getPrivacyContactEmail();

  return (
    <LegalPageLayout title={t("legal.terms.title")}>
      <LegalSection title={t("legal.terms.agreementTitle")}>
        <p>{t("legal.terms.agreementBody")}</p>
      </LegalSection>

      <LegalSection title={t("legal.terms.serviceTitle")}>
        <p>{t("legal.terms.serviceBody")}</p>
        <LegalList
          items={[
            t("legal.terms.serviceCrm"),
            t("legal.terms.serviceMessaging"),
            t("legal.terms.serviceAi"),
            t("legal.terms.serviceBooking"),
          ]}
        />
      </LegalSection>

      <LegalSection title={t("legal.terms.accountsTitle")}>
        <p>{t("legal.terms.accountsBody")}</p>
      </LegalSection>

      <LegalSection title={t("legal.terms.customerDataTitle")}>
        <p>{t("legal.terms.customerDataBody")}</p>
      </LegalSection>

      <LegalSection title={t("legal.terms.integrationsTitle")}>
        <p>{t("legal.terms.integrationsBody")}</p>
      </LegalSection>

      <LegalSection title={t("legal.terms.acceptableTitle")}>
        <p>{t("legal.terms.acceptableBody")}</p>
      </LegalSection>

      <LegalSection title={t("legal.terms.availabilityTitle")}>
        <p>{t("legal.terms.availabilityBody")}</p>
      </LegalSection>

      <LegalSection title={t("legal.terms.liabilityTitle")}>
        <p>{t("legal.terms.liabilityBody")}</p>
      </LegalSection>

      <LegalSection title={t("legal.terms.privacyTitle")}>
        <p>
          {t("legal.terms.privacyBody")}{" "}
          <Link href="/privacy-policy" className="text-primary font-medium underline-offset-4 hover:underline">
            {t("legal.nav.privacy")}
          </Link>{" "}
          {t("legal.terms.privacyAnd")}{" "}
          <Link href="/data-deletion" className="text-primary font-medium underline-offset-4 hover:underline">
            {t("legal.nav.dataDeletion")}
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection title={t("legal.terms.changesTitle")}>
        <p>{t("legal.terms.changesBody")}</p>
      </LegalSection>

      <LegalSection title={t("legal.terms.contactTitle")}>
        <p>{t("legal.terms.contactBody", { email })}</p>
      </LegalSection>
    </LegalPageLayout>
  );
}
