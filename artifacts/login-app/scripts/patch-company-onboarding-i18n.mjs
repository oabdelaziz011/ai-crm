import fs from "node:fs";

function patch(localePath, patcher) {
  const raw = fs.readFileSync(localePath, "utf8");
  const json = JSON.parse(raw);
  patcher(json);
  fs.writeFileSync(localePath, `${JSON.stringify(json, null, 2)}\n`);
}

const enOnboarding = {
  title: "Company onboarding",
  subtitleFirstTime: "Create your company to start using ValueOR.",
  subtitleAdmin: "Create a new company and invite its initial administrator.",
  progressLabel: "Onboarding steps",
  gateTitle: "Set up your company",
  gateBody: "Complete company onboarding to continue to your workspace.",
  actions: { back: "Back", next: "Next", create: "Create Company" },
  steps: {
    company: {
      label: "Company",
      title: "Company information",
      description: "Tell us about the organization you are creating.",
    },
    business: {
      label: "Business",
      title: "Business and location",
      description: "Set location, timezone, and currency preferences.",
    },
    owner: {
      label: "Owner",
      title: "Initial owner / administrator",
      description: "This person becomes the Company Admin through existing RBAC.",
    },
    plan: {
      label: "Plan",
      title: "Plan",
      description: "Your starting plan is assigned automatically. Billing stays unchanged.",
    },
    review: {
      label: "Review",
      title: "Review and create",
      description: "Confirm the details before creating the company.",
    },
  },
  fields: {
    selectPlaceholder: "Select…",
    name: "Company name",
    legalName: "Legal / registered name",
    businessType: "Business type",
    industry: "Industry",
    contactEmail: "Company email",
    contactPhone: "Company phone",
    website: "Website",
    description: "Company description",
    taxId: "Tax / VAT number",
    commercialRegistration: "Commercial registration number",
    country: "Country",
    city: "City",
    address: "Address",
    timezone: "Timezone",
    currency: "Currency",
    ownerFirstName: "First name",
    ownerLastName: "Last name",
    ownerDisplayName: "Display name",
    ownerEmail: "Work email",
    ownerPhone: "Phone",
    ownerJobTitle: "Job title",
    plan: "Plan",
    status: "Status",
  },
  businessTypes: {
    clinic: "Clinic",
    hospital: "Hospital",
    dental: "Dental practice",
    pharmacy: "Pharmacy",
    retail: "Retail",
    services: "Services",
    education: "Education",
    technology: "Technology",
    other: "Other",
  },
  industries: {
    healthcare: "Healthcare",
    beauty_wellness: "Beauty & wellness",
    retail_commerce: "Retail & commerce",
    professional_services: "Professional services",
    education_training: "Education & training",
    technology_software: "Technology & software",
    hospitality: "Hospitality",
    other: "Other",
  },
  owner: {
    firstTimeHint:
      "You are already signed in. We will assign you as Company Admin — no second login is created.",
  },
  plan: {
    readOnlyBadge: "Read-only",
    defaultName: "Basic",
    defaultDescription:
      "Starter plan for new companies. Payment and plan upgrades stay in billing.",
    trialLabel: "Trial",
    interval: "Billing interval",
    monthly: "Monthly",
    price: "Price",
    month: "month",
    included: "Included with trial",
    status: "Status",
    noPaymentHint: "No payment is collected during onboarding.",
  },
  review: {
    company: "Company",
    business: "Business",
    owner: "Owner",
    plan: "Plan",
    edit: "Edit",
  },
  validation: {
    required: "This field is required",
    emailInvalid: "Enter a valid email address",
    websiteInvalid: "Enter a valid website URL",
    nameTooLong: "Value is too long",
  },
  errors: {
    alreadyAssigned: "Your account already belongs to a company.",
    forbidden: "You are not allowed to create a company.",
    duplicate: "Company creation is already in progress.",
    generic: "Could not create the company. Please try again.",
    formIncomplete: "Please complete the required fields before creating the company.",
    ownerInviteNoRole:
      "Company created, but no admin role is available to invite the owner.",
  },
};

const arOnboarding = {
  title: "إعداد الشركة",
  subtitleFirstTime: "أنشئ شركتك للبدء في استخدام ValueOR.",
  subtitleAdmin: "أنشئ شركة جديدة وادعُ المسؤول الأولي لها.",
  progressLabel: "خطوات الإعداد",
  gateTitle: "إعداد شركتك",
  gateBody: "أكمل إعداد الشركة للمتابعة إلى مساحة العمل.",
  actions: { back: "رجوع", next: "التالي", create: "إنشاء الشركة" },
  steps: {
    company: {
      label: "الشركة",
      title: "معلومات الشركة",
      description: "أخبرنا عن المنشأة التي تقوم بإنشائها.",
    },
    business: {
      label: "الأعمال",
      title: "تفاصيل العمل والموقع",
      description: "حدد الموقع والمنطقة الزمنية والعملة.",
    },
    owner: {
      label: "المالك",
      title: "المالك / المسؤول الأولي",
      description: "سيصبح هذا الشخص مسؤول الشركة عبر نظام الصلاحيات الحالي.",
    },
    plan: {
      label: "الخطة",
      title: "الخطة",
      description: "يتم تعيين الخطة الابتدائية تلقائيًا دون تغيير الفوترة.",
    },
    review: {
      label: "مراجعة",
      title: "مراجعة وإنشاء",
      description: "راجع التفاصيل قبل إنشاء الشركة.",
    },
  },
  fields: {
    selectPlaceholder: "اختر…",
    name: "اسم الشركة",
    legalName: "الاسم القانوني / المسجل",
    businessType: "نوع النشاط",
    industry: "القطاع",
    contactEmail: "بريد الشركة",
    contactPhone: "هاتف الشركة",
    website: "الموقع الإلكتروني",
    description: "وصف الشركة",
    taxId: "الرقم الضريبي / ضريبة القيمة المضافة",
    commercialRegistration: "رقم السجل التجاري",
    country: "الدولة",
    city: "المدينة",
    address: "العنوان",
    timezone: "المنطقة الزمنية",
    currency: "العملة",
    ownerFirstName: "الاسم الأول",
    ownerLastName: "اسم العائلة",
    ownerDisplayName: "الاسم المعروض",
    ownerEmail: "البريد الوظيفي",
    ownerPhone: "الهاتف",
    ownerJobTitle: "المسمى الوظيفي",
    plan: "الخطة",
    status: "الحالة",
  },
  businessTypes: {
    clinic: "عيادة",
    hospital: "مستشفى",
    dental: "عيادة أسنان",
    pharmacy: "صيدلية",
    retail: "تجزئة",
    services: "خدمات",
    education: "تعليم",
    technology: "تقنية",
    other: "أخرى",
  },
  industries: {
    healthcare: "الرعاية الصحية",
    beauty_wellness: "التجميل والعافية",
    retail_commerce: "التجزئة والتجارة",
    professional_services: "الخدمات المهنية",
    education_training: "التعليم والتدريب",
    technology_software: "التقنية والبرمجيات",
    hospitality: "الضيافة",
    other: "أخرى",
  },
  owner: {
    firstTimeHint:
      "أنت مسجّل الدخول بالفعل. سيتم تعيينك كمسؤول للشركة — دون إنشاء حساب دخول جديد.",
  },
  plan: {
    readOnlyBadge: "للعرض فقط",
    defaultName: "أساسي",
    defaultDescription:
      "الخطة الابتدائية للشركات الجديدة. الدفع وترقية الخطط تبقى ضمن الفوترة.",
    trialLabel: "تجريبي",
    interval: "دورة الفوترة",
    monthly: "شهري",
    price: "السعر",
    month: "شهر",
    included: "مشمول مع الفترة التجريبية",
    status: "الحالة",
    noPaymentHint: "لا يتم تحصيل أي دفعة أثناء الإعداد.",
  },
  review: {
    company: "الشركة",
    business: "الأعمال",
    owner: "المالك",
    plan: "الخطة",
    edit: "تعديل",
  },
  validation: {
    required: "هذا الحقل مطلوب",
    emailInvalid: "أدخل بريدًا إلكترونيًا صالحًا",
    websiteInvalid: "أدخل رابط موقع صالحًا",
    nameTooLong: "القيمة طويلة جدًا",
  },
  errors: {
    alreadyAssigned: "حسابك مرتبط بشركة بالفعل.",
    forbidden: "غير مسموح لك بإنشاء شركة.",
    duplicate: "إنشاء الشركة قيد التنفيذ بالفعل.",
    generic: "تعذر إنشاء الشركة. حاول مرة أخرى.",
    formIncomplete: "أكمل الحقول المطلوبة قبل إنشاء الشركة.",
    ownerInviteNoRole: "تم إنشاء الشركة، لكن لا يوجد دور مسؤول لدعوة المالك.",
  },
};

patch("artifacts/login-app/src/locales/en/common.json", (json) => {
  json.companies = {
    ...json.companies,
    deleteTitle: 'Delete company "{{name}}"?',
    deleteDescription: "This permanently removes the company and related tenant data.",
    table: {
      name: "Company",
      businessType: "Business type",
      industry: "Industry",
      status: "Status",
      plan: "Plan",
      owner: "Owner",
      email: "Email",
      phone: "Phone",
      location: "Location",
      created: "Created",
      updated: "Updated",
      actions: "Actions",
      dash: "—",
    },
  };
  json.companyOnboarding = enOnboarding;
});

patch("artifacts/login-app/src/locales/ar/common.json", (json) => {
  json.companies = {
    ...json.companies,
    deleteTitle: 'حذف الشركة "{{name}}"؟',
    deleteDescription: "سيتم حذف الشركة وبيانات المستأجر المرتبطة بها نهائيًا.",
    table: {
      name: "الشركة",
      businessType: "نوع النشاط",
      industry: "القطاع",
      status: "الحالة",
      plan: "الخطة",
      owner: "المالك",
      email: "البريد",
      phone: "الهاتف",
      location: "الموقع",
      created: "تاريخ الإنشاء",
      updated: "آخر تحديث",
      actions: "إجراءات",
      dash: "—",
    },
  };
  json.companyOnboarding = arOnboarding;
});

console.log("locale patch complete");
