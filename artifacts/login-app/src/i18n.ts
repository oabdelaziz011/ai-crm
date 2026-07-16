import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import enCommon from "@/locales/en/common.json";
import arCommon from "@/locales/ar/common.json";

const LANGUAGE_STORAGE_KEY = "app.language";
const RTL_LANGUAGES = new Set(["ar"]);

function getInitialLanguage() {
  if (typeof window === "undefined") {
    return "en";
  }
  const savedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  return savedLanguage === "ar" || savedLanguage === "en" ? savedLanguage : "en";
}

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
    en: { common: enCommon },
    ar: { common: arCommon },
  },
  lng: getInitialLanguage(),
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
  if (typeof window !== "undefined") {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  }
  applyDocumentLanguage(language);
});

export default i18n;
