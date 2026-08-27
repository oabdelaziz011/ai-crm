/** Country → city catalogs for company onboarding / edit forms. */

export type GeoLabeledValue = {
  value: string;
  labelEn: string;
  labelAr: string;
};

export type GeoCountry = GeoLabeledValue & {
  code: string;
  cities: readonly GeoLabeledValue[];
};

function city(value: string, labelAr: string, labelEn = value): GeoLabeledValue {
  return { value, labelEn, labelAr };
}

function country(
  code: string,
  value: string,
  labelAr: string,
  cities: readonly GeoLabeledValue[],
  labelEn = value,
): GeoCountry {
  return { code, value, labelEn, labelAr, cities };
}

export const COMPANY_GEO_COUNTRIES: readonly GeoCountry[] = [
  country("SA", "Saudi Arabia", "المملكة العربية السعودية", [
    city("Riyadh", "الرياض"),
    city("Jeddah", "جدة"),
    city("Mecca", "مكة المكرمة"),
    city("Medina", "المدينة المنورة"),
    city("Dammam", "الدمام"),
    city("Khobar", "الخبر"),
    city("Dhahran", "الظهران"),
    city("Taif", "الطائف"),
    city("Abha", "أبها"),
    city("Tabuk", "تبوك"),
    city("Buraidah", "بريدة"),
    city("Jubail", "الجبيل"),
    city("Yanbu", "ينبع"),
    city("Najran", "نجران"),
    city("Jazan", "جازان"),
    city("Hail", "حائل"),
  ]),
  country("AE", "United Arab Emirates", "الإمارات العربية المتحدة", [
    city("Dubai", "دبي"),
    city("Abu Dhabi", "أبو ظبي"),
    city("Sharjah", "الشارقة"),
    city("Ajman", "عجمان"),
    city("Ras Al Khaimah", "رأس الخيمة"),
    city("Fujairah", "الفجيرة"),
    city("Umm Al Quwain", "أم القيوين"),
    city("Al Ain", "العين"),
  ]),
  country("EG", "Egypt", "مصر", [
    city("Cairo", "القاهرة"),
    city("Giza", "الجيزة"),
    city("Alexandria", "الإسكندرية"),
    city("Mansoura", "المنصورة"),
    city("Tanta", "طنطا"),
    city("Aswan", "أسوان"),
    city("Luxor", "الأقصر"),
    city("Port Said", "بورسعيد"),
    city("Suez", "السويس"),
    city("Ismailia", "الإسماعيلية"),
    city("Hurghada", "الغردقة"),
    city("Sharm El Sheikh", "شرم الشيخ"),
  ]),
  country("KW", "Kuwait", "الكويت", [
    city("Kuwait City", "مدينة الكويت"),
    city("Hawalli", "حولي"),
    city("Salmiya", "السالمية"),
    city("Farwaniya", "الفروانية"),
    city("Jahra", "الجهراء"),
    city("Ahmadi", "الأحمدي"),
  ]),
  country("QA", "Qatar", "قطر", [
    city("Doha", "الدوحة"),
    city("Al Rayyan", "الريان"),
    city("Al Wakrah", "الوكرة"),
    city("Lusail", "لوسيل"),
    city("Al Khor", "الخور"),
  ]),
  country("BH", "Bahrain", "البحرين", [
    city("Manama", "المنامة"),
    city("Riffa", "الرفاع"),
    city("Muharraq", "المحرق"),
    city("Hamad Town", "مدينة حمد"),
    city("Isa Town", "مدينة عيسى"),
  ]),
  country("OM", "Oman", "عُمان", [
    city("Muscat", "مسقط"),
    city("Salalah", "صلالة"),
    city("Sohar", "صحار"),
    city("Nizwa", "نزوى"),
    city("Sur", "صور"),
  ]),
  country("JO", "Jordan", "الأردن", [
    city("Amman", "عمّان"),
    city("Irbid", "إربد"),
    city("Zarqa", "الزرقاء"),
    city("Aqaba", "العقبة"),
    city("Madaba", "مادبا"),
  ]),
  country("LB", "Lebanon", "لبنان", [
    city("Beirut", "بيروت"),
    city("Tripoli", "طرابلس"),
    city("Sidon", "صيدا"),
    city("Zahle", "زحلة"),
    city("Byblos", "جبيل"),
  ]),
  country("MA", "Morocco", "المغرب", [
    city("Casablanca", "الدار البيضاء"),
    city("Rabat", "الرباط"),
    city("Marrakech", "مراكش"),
    city("Fez", "فاس"),
    city("Tangier", "طنجة"),
    city("Agadir", "أغادير"),
  ]),
  country("TN", "Tunisia", "تونس", [
    city("Tunis", "تونس"),
    city("Sfax", "صفاقس"),
    city("Sousse", "سوسة"),
    city("Bizerte", "بنزرت"),
  ]),
  country("IQ", "Iraq", "العراق", [
    city("Baghdad", "بغداد"),
    city("Basra", "البصرة"),
    city("Erbil", "أربيل"),
    city("Mosul", "الموصل"),
    city("Najaf", "النجف"),
  ]),
  country("PS", "Palestine", "فلسطين", [
    city("Ramallah", "رام الله"),
    city("Gaza", "غزة"),
    city("Nablus", "نابلس"),
    city("Hebron", "الخليل"),
    city("Bethlehem", "بيت لحم"),
  ]),
  country("YE", "Yemen", "اليمن", [
    city("Sanaa", "صنعاء"),
    city("Aden", "عدن"),
    city("Taiz", "تعز"),
  ]),
  country("TR", "Turkey", "تركيا", [
    city("Istanbul", "إسطنبول"),
    city("Ankara", "أنقرة"),
    city("Izmir", "إزمير"),
    city("Antalya", "أنطاليا"),
  ]),
  country("GB", "United Kingdom", "المملكة المتحدة", [
    city("London", "لندن"),
    city("Manchester", "مانشستر"),
    city("Birmingham", "برمنغهام"),
  ]),
  country("US", "United States", "الولايات المتحدة", [
    city("New York", "نيويورك"),
    city("Los Angeles", "لوس أنجلوس"),
    city("Chicago", "شيكاغو"),
    city("Houston", "هيوستن"),
    city("Miami", "ميامي"),
  ]),
  country("IN", "India", "الهند", [
    city("Mumbai", "مومباي"),
    city("Delhi", "دلهي"),
    city("Bangalore", "بنغالور"),
    city("Hyderabad", "حيدر آباد"),
  ]),
  country("PK", "Pakistan", "باكستان", [
    city("Karachi", "كراتشي"),
    city("Lahore", "لاهور"),
    city("Islamabad", "إسلام آباد"),
  ]),
];

export function geoLabel(item: GeoLabeledValue, language: string): string {
  return language.toLowerCase().startsWith("ar") ? item.labelAr : item.labelEn;
}

export function findGeoCountry(countryValue: string): GeoCountry | undefined {
  const needle = countryValue.trim().toLowerCase();
  if (!needle) return undefined;
  return COMPANY_GEO_COUNTRIES.find(
    (c) =>
      c.value.toLowerCase() === needle ||
      c.code.toLowerCase() === needle ||
      c.labelEn.toLowerCase() === needle ||
      c.labelAr === countryValue.trim(),
  );
}

export function findGeoCity(
  cityValue: string,
  countryValue?: string | null,
): GeoLabeledValue | undefined {
  const trimmed = cityValue.trim();
  if (!trimmed) return undefined;
  const needle = trimmed.toLowerCase();
  const scoped = countryValue ? getCitiesForCountry(countryValue) : null;
  const cities = scoped && scoped.length > 0
    ? scoped
    : COMPANY_GEO_COUNTRIES.flatMap((country) => country.cities);
  return cities.find(
    (city) =>
      city.value.toLowerCase() === needle ||
      city.labelEn.toLowerCase() === needle ||
      city.labelAr === trimmed,
  );
}

/** Resolve a stored country/city value to the label for the active UI language. */
export function resolveGeoDisplayLabel(
  value: string | null | undefined,
  language: string,
  options?: { countryValue?: string | null },
): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const country = findGeoCountry(trimmed);
  if (country) return geoLabel(country, language);
  const city = findGeoCity(trimmed, options?.countryValue);
  if (city) return geoLabel(city, language);
  return trimmed;
}

export function getCitiesForCountry(countryValue: string): readonly GeoLabeledValue[] {
  return findGeoCountry(countryValue)?.cities ?? [];
}

/** Keep legacy free-text values selectable when editing existing records. */
export function withLegacyOption(
  options: readonly GeoLabeledValue[],
  currentValue: string,
): GeoLabeledValue[] {
  const trimmed = currentValue.trim();
  if (!trimmed) return [...options];
  const exists = options.some(
    (o) =>
      o.value.toLowerCase() === trimmed.toLowerCase() ||
      o.labelEn.toLowerCase() === trimmed.toLowerCase() ||
      o.labelAr === trimmed,
  );
  if (exists) return [...options];
  return [{ value: trimmed, labelEn: trimmed, labelAr: trimmed }, ...options];
}

export function normalizeStoredCountry(countryValue: string): string {
  const found = findGeoCountry(countryValue);
  return found?.value ?? countryValue.trim();
}

export function normalizeStoredCity(countryValue: string, cityValue: string): string {
  const trimmed = cityValue.trim();
  if (!trimmed) return "";
  const cities = getCitiesForCountry(countryValue);
  const match = cities.find(
    (c) =>
      c.value.toLowerCase() === trimmed.toLowerCase() ||
      c.labelEn.toLowerCase() === trimmed.toLowerCase() ||
      c.labelAr === trimmed,
  );
  return match?.value ?? trimmed;
}
