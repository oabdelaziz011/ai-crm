import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  buildDataDeletionMailtoHref,
  getPrivacyContactEmail,
} from "@/lib/legal/privacy-contact";
import { LegalList, LegalPageLayout, LegalSection } from "@/pages/legal/legal-page-layout";

export default function DataDeletionPage() {
  const { t } = useTranslation("common");
  const email = getPrivacyContactEmail();
  const mailto = buildDataDeletionMailtoHref(email, t("legal.dataDeletion.emailSubject"));

  return (
    <LegalPageLayout title={t("legal.dataDeletion.title")}>
      <LegalSection title={t("legal.dataDeletion.howTitle")}>
        <p>{t("legal.dataDeletion.howBody")}</p>
        <LegalList
          items={[
            t("legal.dataDeletion.includeName"),
            t("legal.dataDeletion.includeEmail"),
            t("legal.dataDeletion.includeCompany"),
            t("legal.dataDeletion.includeChannel"),
            t("legal.dataDeletion.includeDetails"),
          ]}
        />
      </LegalSection>

      <LegalSection title={t("legal.dataDeletion.requestTitle")}>
        <p>{t("legal.dataDeletion.requestBody", { email })}</p>
        <div className="pt-2">
          <Button asChild>
            <a href={mailto}>{t("legal.dataDeletion.requestCta")}</a>
          </Button>
        </div>
        <p className="text-sm">
          {t("legal.dataDeletion.emailLabel")}:{" "}
          <a className="text-primary font-medium underline-offset-4 hover:underline" href={mailto}>
            {email}
          </a>
        </p>
      </LegalSection>

      <LegalSection title={t("legal.dataDeletion.afterTitle")}>
        <p>{t("legal.dataDeletion.afterBody")}</p>
      </LegalSection>

      <LegalSection title={t("legal.dataDeletion.relatedTitle")}>
        <p>
          {t("legal.dataDeletion.relatedBody")}{" "}
          <Link href="/privacy-policy" className="text-primary font-medium underline-offset-4 hover:underline">
            {t("legal.nav.privacy")}
          </Link>
          .
        </p>
      </LegalSection>
    </LegalPageLayout>
  );
}
