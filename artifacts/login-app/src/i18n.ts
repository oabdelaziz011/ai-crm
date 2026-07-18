import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import enCommon from "@/locales/en/common.json";
import arCommon from "@/locales/ar/common.json";
import enBillingSettingsFields from "@/locales/en/billing-settings-fields.json";
import arBillingSettingsFields from "@/locales/ar/billing-settings-fields.json";
import {
  cacheAppLanguage,
  isAppLanguage,
  resolveBootstrapAppLanguage,
} from "@/lib/i18n/resolve-app-language";

const RTL_LANGUAGES = new Set(["ar"]);

function applyDocumentLanguage(language: string) {
  if (typeof document === "undefined") {
    return;
  }

  const direction = RTL_LANGUAGES.has(language) ? "rtl" : "ltr";
  document.documentElement.lang = language;
  document.documentElement.dir = direction;
  document.body.setAttribute("dir", direction);
}

void i18n.use(initReactI18next).init({
  resources: {
    en: {
      common: {
        ...enCommon,
        billing: {
          ...enCommon.billing,
          settings: {
            ...enCommon.billing.settings,
            ...enBillingSettingsFields,
            validation: {
              ...enCommon.billing.settings.validation,
              ...enBillingSettingsFields.validation,
            },
          },
          payment: {
            ...enCommon.billing.payment,
            methodLabel: "Payment method",
            noMethods: "No payment methods are enabled in billing settings.",
            providerMode: "Provider mode",
            providerCode: "Provider",
            autoRenewal: "Auto-renewal",
          },
          platform: {
            ...enCommon.billing.platform,
            providerHealth: {
              ...enCommon.billing.platform.providerHealth,
              activeMode: "Active payment mode",
              activeProvider: "Active provider",
              activeRoute: "Active route",
            },
          },
        },
      },
    },
    ar: {
      common: {
        ...arCommon,
        billing: {
          ...arCommon.billing,
          settings: {
            ...arCommon.billing.settings,
            ...arBillingSettingsFields,
            validation: {
              ...arCommon.billing.settings.validation,
              ...arBillingSettingsFields.validation,
            },
            tabs: {
              ...arCommon.billing.settings.tabs,
              webhooks: "الويبhook",
            },
          },
          payment: {
            ...arCommon.billing.payment,
            methodLabel: "طريقة الدفع",
            noMethods: "لا توجد طرق دفع مفعّلة في إعدادات الفوترة.",
            providerMode: "وضع المزود",
            providerCode: "المزود",
            autoRenewal: "التجديد التلقائي",
          },
          platform: {
            ...arCommon.billing.platform,
            providerHealth: {
              ...arCommon.billing.platform.providerHealth,
              activeMode: "وضع الدفع النشط",
              activeProvider: "المزود النشط",
              activeRoute: "المسار النشط",
            },
          },
        },
      },
    },
  },
  lng: resolveBootstrapAppLanguage(),
  fallbackLng: "en",
  supportedLngs: ["en", "ar"],
  defaultNS: "common",
  ns: ["common"],
  interpolation: {
    escapeValue: false,
  },
});

applyDocumentLanguage(i18n.resolvedLanguage ?? i18n.language ?? "en");

i18n.on("languageChanged", (language) => {
  if (isAppLanguage(language)) {
    cacheAppLanguage(language);
  }
  applyDocumentLanguage(language);
});

export default i18n;
