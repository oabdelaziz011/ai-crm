import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { getPrivacyContactEmail } from "@/lib/legal/privacy-contact";
import { LegalList, LegalPageLayout, LegalSection } from "@/pages/legal/legal-page-layout";

export default function PrivacyPolicyPage() {
  const { t } = useTranslation("common");
  const email = getPrivacyContactEmail();

  return (
    <LegalPageLayout title={t("legal.privacy.title")}>
      <LegalSection title={t("legal.privacy.scopeTitle")}>
        <p>{t("legal.privacy.scopeBody")}</p>
      </LegalSection>

      <LegalSection title={t("legal.privacy.collectTitle")}>
        <p>{t("legal.privacy.collectIntro")}</p>
        <LegalList
          items={[
            t("legal.privacy.collectAccount"),
            t("legal.privacy.collectContact"),
            t("legal.privacy.collectCrm"),
            t("legal.privacy.collectMessages"),
            t("legal.privacy.collectWhatsapp"),
            t("legal.privacy.collectInstagram"),
            t("legal.privacy.collectTechnical"),
          ]}
        />
      </LegalSection>

      <LegalSection title={t("legal.privacy.useTitle")}>
        <p>{t("legal.privacy.useIntro")}</p>
        <LegalList
          items={[
            t("legal.privacy.useOperate"),
            t("legal.privacy.useCrm"),
            t("legal.privacy.useAi"),
            t("legal.privacy.useMessaging"),
            t("legal.privacy.useSecurity"),
          ]}
        />
      </LegalSection>

      <LegalSection title={t("legal.privacy.metaTitle")}>
        <p>{t("legal.privacy.metaBody")}</p>
        <LegalList
          items={[
            t("legal.privacy.metaEnabledOnly"),
            t("legal.privacy.metaNoSell"),
            t("legal.privacy.metaNoAds"),
          ]}
        />
      </LegalSection>

      <LegalSection title={t("legal.privacy.providersTitle")}>
        <p>{t("legal.privacy.providersIntro")}</p>
        <LegalList
          items={[
            t("legal.privacy.providersMeta"),
            t("legal.privacy.providersAi"),
            t("legal.privacy.providersCloud"),
            t("legal.privacy.providersLimit"),
          ]}
        />
      </LegalSection>

      <LegalSection title={t("legal.privacy.retentionTitle")}>
        <p>{t("legal.privacy.retentionBody")}</p>
      </LegalSection>

      <LegalSection title={t("legal.privacy.securityTitle")}>
        <p>{t("legal.privacy.securityBody")}</p>
      </LegalSection>

      <LegalSection title={t("legal.privacy.deletionTitle")}>
        <p>{t("legal.privacy.deletionBody")}</p>
        <p>
          <Link href="/data-deletion" className="text-primary font-medium underline-offset-4 hover:underline">
            {t("legal.nav.dataDeletion")}
          </Link>
        </p>
      </LegalSection>

      <LegalSection title={t("legal.privacy.rightsTitle")}>
        <p>{t("legal.privacy.rightsBody")}</p>
      </LegalSection>

      <LegalSection title={t("legal.privacy.cookiesTitle")}>
        <p>{t("legal.privacy.cookiesBody")}</p>
      </LegalSection>

      <LegalSection title={t("legal.privacy.childrenTitle")}>
        <p>{t("legal.privacy.childrenBody")}</p>
      </LegalSection>

      <LegalSection title={t("legal.privacy.internationalTitle")}>
        <p>{t("legal.privacy.internationalBody")}</p>
      </LegalSection>

      <LegalSection title={t("legal.privacy.changesTitle")}>
        <p>{t("legal.privacy.changesBody")}</p>
      </LegalSection>

      <LegalSection title={t("legal.privacy.contactTitle")}>
        <p>{t("legal.privacy.contactBody", { email })}</p>
      </LegalSection>
    </LegalPageLayout>
  );
}
