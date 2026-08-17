import fs from "fs";
import path from "path";

const migDir = "supabase/migrations";
const codes = new Map();
for (const f of fs.readdirSync(migDir).filter((x) => x.endsWith(".sql"))) {
  const t = fs.readFileSync(path.join(migDir, f), "utf8");
  for (const m of t.matchAll(
    /\(\s*\n?\s*'([a-z][a-z0-9_]+\.[a-z][a-z0-9_]+)'\s*,\s*\n?\s*'([^']*)'\s*,\s*\n?\s*'([^']*)'\s*,\s*\n?\s*'([^']*)'\s*,\s*\n?\s*'([^']*)'\s*\n?\s*\)/g,
  )) {
    codes.set(m[1], { category: m[2], module: m[3], action: m[4], description: m[5] });
  }
}

function groupFor(code) {
  const p = code.split(".")[0];
  const map = {
    customers: "customers",
    bookings: "bookings",
    invoices: "invoices",
    reports: "reports",
    dashboard: "dashboard",
    workspace: "workspace",
    billing: "billing",
    subscriptions: "billing",
    users: "users",
    roles: "roles",
    permissions: "roles",
    companies: "companies",
    settings: "settings",
    audit_logs: "audit",
    ai_assistant: "aiAssistant",
    ai_chat: "aiChat",
    conversation: "conversations",
    channels: "channels",
    knowledge: "knowledge",
    whatsapp: "whatsapp",
    automation: "automation",
    leads: "leads",
    tickets: "tickets",
    products: "products",
    quotes: "quotes",
    opportunities: "opportunities",
    handoff: "handoff",
    organization: "organization",
    marketplace: "marketplace",
    integrations: "integrations",
    governance: "governance",
    configuration: "configuration",
    feature_flags: "featureFlags",
    licenses: "licenses",
    operations: "operations",
    tasks: "tasks",
    skills: "skills",
    agents: "aiPlatform",
    prompts: "aiPlatform",
    tools: "aiPlatform",
    embeddings: "aiPlatform",
    vectorstores: "aiPlatform",
    collections: "aiPlatform",
    vectorquery: "aiPlatform",
    retrieval: "aiPlatform",
    workflow: "automation",
    collaboration: "aiPlatform",
    executive: "executive",
    availability: "bookings",
  };
  if (code.startsWith("ai.analytics") || code.startsWith("ai.costs")) return "aiAnalytics";
  if (code.startsWith("ai.conversations")) return "conversations";
  if (code.startsWith("company.")) return "company";
  return map[p] ?? "aiPlatform";
}

function titleCaseAction(action, module) {
  return `${action} ${module}`.replace(/\s+/g, " ").trim();
}

const arNameOverrides = {
  "automation.create": "إنشاء تدفقات الأتمتة",
  "automation.edit": "تعديل تدفقات الأتمتة",
  "automation.delete": "حذف تدفقات الأتمتة",
  "automation.publish": "نشر تدفقات الأتمتة",
  "automation.execute": "تنفيذ تدفقات الأتمتة والجلسات",
  "automation.rollback": "تفعيل إصدار سابق لسير العمل",
  "automation.archive": "أرشفة سير العمل وإيقاف التنفيذ الإنتاجي",
  "automation.view": "عرض الأتمتة",
  "automation.simulate": "محاكاة سير العمل",
  "leads.view": "عرض العملاء المحتملين",
  "leads.create": "إنشاء عملاء محتملين",
  "leads.edit": "تعديل العملاء المحتملين",
  "leads.delete": "حذف العملاء المحتملين",
  "leads.assign": "تعيين العملاء المحتملين",
  "leads.convert": "تحويل العملاء المحتملين",
  "leads.export": "تصدير العملاء المحتملين",
  "leads.manage": "إدارة منصة العملاء المحتملين",
  "leads.merge": "دمج العملاء المحتملين",
  "leads.qualify": "تأهيل العملاء المحتملين",
  "leads.archive": "أرشفة العملاء المحتملين",
  "tickets.view": "عرض التذاكر",
  "tickets.create": "إنشاء تذاكر",
  "tickets.edit": "تعديل التذاكر",
  "tickets.assign": "تعيين التذاكر",
  "tickets.close": "إغلاق التذاكر",
  "tickets.comment": "التعليق على التذاكر",
  "tickets.manage": "إدارة منصة التذاكر",
  "products.view": "عرض المنتجات",
  "products.create": "إنشاء منتجات",
  "products.edit": "تعديل المنتجات",
  "products.delete": "أرشفة المنتجات",
  "products.pricing": "إدارة التسعير",
  "quotes.view": "عرض عروض الأسعار",
  "quotes.create": "إنشاء عروض أسعار",
  "quotes.edit": "تعديل عروض الأسعار",
  "quotes.delete": "أرشفة عروض الأسعار",
  "quotes.send": "إرسال عروض الأسعار",
  "quotes.approve": "اعتماد عروض الأسعار",
  "opportunities.view": "عرض الفرص",
  "opportunities.create": "إنشاء فرص",
  "opportunities.edit": "تعديل الفرص",
  "opportunities.delete": "حذف الفرص",
  "opportunities.convert": "تحويل إلى فرص",
  "handoff.view": "عرض التحويل البشري",
  "handoff.accept": "قبول المحادثات المحولة",
  "handoff.assign": "تعيين المحادثات",
  "handoff.escalate": "تصعيد المحادثات",
  "handoff.manage": "إدارة قواعد التحويل",
  "handoff.presence": "حالة حضور الوكلاء",
  "handoff.queue": "إدارة طابور التحويل",
  "handoff.reject": "رفض طلبات التحويل",
  "handoff.return_to_ai": "إعادة المحادثة للذكاء الاصطناعي",
  "handoff.transfer": "نقل المحادثات",
  "organization.view": "عرض الهيكل التنظيمي",
  "organization.manage": "إدارة الهيكل التنظيمي",
  "organization.transfer": "نقل بين الفروع",
  "marketplace.view": "عرض سوق الإضافات",
  "marketplace.install": "تثبيت الإضافات",
  "marketplace.manage": "إدارة الإضافات",
  "marketplace.develop": "نشر إضافات مخصصة",
  "integrations.view": "عرض مركز التكامل",
  "integrations.manage": "إدارة التكاملات",
  "integrations.api_keys": "إدارة مفاتيح API",
  "integrations.webhooks": "إدارة Webhooks",
  "governance.view": "عرض حوكمة الذكاء الاصطناعي",
  "governance.create": "إنشاء سياسات الحوكمة",
  "governance.edit": "تعديل سياسات الحوكمة",
  "governance.approve": "اعتماد طلبات الحوكمة",
  "governance.manage": "إدارة منصة الحوكمة",
  "configuration.read": "عرض إعدادات المنصة",
  "configuration.write": "تعديل مسودات الإعدادات",
  "configuration.publish": "نشر تغييرات الإعدادات",
  "feature_flags.read": "عرض أعلام الميزات",
  "feature_flags.write": "إدارة أعلام الميزات",
  "feature_flags.publish": "نشر أعلام الميزات",
  "licenses.read": "عرض التراخيص والصلاحيات",
  "licenses.write": "إدارة تراخيص الشركة",
  "licenses.assign": "تعيين الخطط والإضافات",
  "operations.read": "عرض مساحة العمليات",
  "operations.write": "تنفيذ أوامر العمليات",
  "tasks.read": "عرض المهام",
  "tasks.write": "إنشاء وإدارة المهام",
  "tasks.assign": "تعيين المهام",
  "skills.view": "عرض مهارات الذكاء الاصطناعي",
  "skills.create": "إنشاء مهارات",
  "skills.edit": "تعديل المهارات",
  "skills.manage": "إدارة المهارات",
  "skills.publish": "نشر إصدارات المهارات",
  "skills.rollback": "استرجاع إصدار مهارة",
  "agents.publish": "نشر إصدارات الموظف الذكي",
  "agents.rollback": "استرجاع إصدار الموظف الذكي",
  "prompts.publish": "نشر قوالب الأوامر",
  "prompts.preview": "معاينة قوالب الأوامر",
  "prompts.rollback": "استرجاع قوالب الأوامر",
  "executive.view": "عرض لوحة الذكاء التنفيذي",
  "executive.manage_alerts": "إدارة تنبيهات التنفيذي",
  "collaboration.view": "عرض تعاون الوكلاء",
  "collaboration.manage": "إدارة مجموعات الوكلاء",
  "collaboration.handover": "طلب تسليم المهام",
  "availability.search": "البحث عن المواعيد المتاحة",
  "workflow.read": "عرض تنفيذات سير العمل",
  "workflow.execute": "بدء وإدارة سير العمل",
  "reports.overview": "عرض تقرير النظرة العامة",
  "reports.customers": "عرض تقرير العملاء",
  "reports.bookings": "عرض تقرير الحجوزات",
  "reports.invoices": "عرض تقرير الفواتير",
  "reports.financial": "عرض التقرير المالي",
  "reports.leads": "عرض تقرير العملاء المحتملين",
  "reports.opportunities": "عرض تقرير الفرص",
  "reports.products": "عرض تقرير المنتجات",
  "reports.quotes": "عرض تقرير عروض الأسعار",
  "reports.tickets": "عرض تقرير التذاكر",
  "reports.operations": "عرض تقرير العمليات",
  "reports.subscriptions": "عرض تقرير الاشتراكات",
  "reports.companies": "عرض تقرير الشركات",
  "reports.company_revenue": "عرض تقرير إيرادات الشركة",
  "reports.executive": "عرض التقرير التنفيذي",
  "reports.ai_operations": "عرض تقرير عمليات الذكاء الاصطناعي",
  "reports.ai_consumption": "عرض تقرير استهلاك الذكاء الاصطناعي",
  "reports.export": "تصدير التقارير",
  "reports.schedule": "جدولة إرسال التقارير",
};

const enPath = "artifacts/login-app/src/locales/en/permission-catalog.json";
const arPath = "artifacts/login-app/src/locales/ar/permission-catalog.json";
const en = JSON.parse(fs.readFileSync(enPath, "utf8"));
const ar = JSON.parse(fs.readFileSync(arPath, "utf8"));

Object.assign(en.groups, {
  leads: { icon: "🎯", order: 25, label: "Leads" },
  tickets: { icon: "🎫", order: 28, label: "Tickets" },
  products: { icon: "📦", order: 32, label: "Products" },
  quotes: { icon: "📝", order: 34, label: "Quotes" },
  opportunities: { icon: "💼", order: 26, label: "Opportunities" },
  handoff: { icon: "🔁", order: 145, label: "Human Handoff" },
  organization: { icon: "🏛️", order: 96, label: "Organization" },
  marketplace: { icon: "🏪", order: 200, label: "Marketplace" },
  integrations: { icon: "🔌", order: 205, label: "Integrations" },
  governance: { icon: "⚖️", order: 210, label: "AI Governance" },
  configuration: { icon: "🧩", order: 215, label: "Configuration" },
  featureFlags: { icon: "🚩", order: 220, label: "Feature Flags" },
  licenses: { icon: "📜", order: 225, label: "Licenses" },
  operations: { icon: "🛠️", order: 230, label: "Operations" },
  tasks: { icon: "✅", order: 235, label: "Tasks" },
  skills: { icon: "🧠", order: 192, label: "AI Skills" },
  executive: { icon: "📊", order: 46, label: "Executive" },
});

Object.assign(ar.groups, {
  leads: { icon: "🎯", order: 25, label: "العملاء المحتملون" },
  tickets: { icon: "🎫", order: 28, label: "التذاكر" },
  products: { icon: "📦", order: 32, label: "المنتجات" },
  quotes: { icon: "📝", order: 34, label: "عروض الأسعار" },
  opportunities: { icon: "💼", order: 26, label: "الفرص" },
  handoff: { icon: "🔁", order: 145, label: "التحويل البشري" },
  organization: { icon: "🏛️", order: 96, label: "التنظيم" },
  marketplace: { icon: "🏪", order: 200, label: "سوق الإضافات" },
  integrations: { icon: "🔌", order: 205, label: "التكاملات" },
  governance: { icon: "⚖️", order: 210, label: "حوكمة الذكاء الاصطناعي" },
  configuration: { icon: "🧩", order: 215, label: "إعدادات المنصة" },
  featureFlags: { icon: "🚩", order: 220, label: "أعلام الميزات" },
  licenses: { icon: "📜", order: 225, label: "التراخيص" },
  operations: { icon: "🛠️", order: 230, label: "العمليات" },
  tasks: { icon: "✅", order: 235, label: "المهام" },
  skills: { icon: "🧠", order: 192, label: "مهارات الذكاء الاصطناعي" },
  executive: { icon: "📊", order: 46, label: "التنفيذي" },
});

let added = 0;
for (const [code, meta] of codes.entries()) {
  const group = groupFor(code);
  const enDesc = meta.description.endsWith(".") ? meta.description : `${meta.description}.`;
  if (!en.codes[code]) {
    en.codes[code] = {
      name: titleCaseAction(meta.action, meta.module),
      description: enDesc,
      group,
    };
    added += 1;
  }
  const arName = arNameOverrides[code] ?? `${meta.action} — ${meta.module}`;
  if (!ar.codes[code]) {
    ar.codes[code] = {
      name: arName,
      description: arNameOverrides[code] ? `يسمح بـ: ${arName}.` : enDesc,
      group,
    };
  } else if (arNameOverrides[code]) {
    ar.codes[code].name = arNameOverrides[code];
    if (!ar.codes[code].description || /^[A-Za-z]/.test(ar.codes[code].description)) {
      ar.codes[code].description = `يسمح بـ: ${arNameOverrides[code]}.`;
    }
  }
}

function sortObj(obj) {
  return Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)));
}
en.codes = sortObj(en.codes);
ar.codes = sortObj(ar.codes);

fs.writeFileSync(enPath, `${JSON.stringify(en, null, 2)}\n`);
fs.writeFileSync(arPath, `${JSON.stringify(ar, null, 2)}\n`);

const englishish = Object.entries(ar.codes)
  .filter(([, v]) => /^[A-Za-z]/.test(v.name))
  .map(([c]) => c);

const actionAr = {
  View: "عرض",
  Create: "إنشاء",
  Edit: "تعديل",
  Delete: "حذف",
  Archive: "أرشفة",
  Manage: "إدارة",
  Assign: "تعيين",
  Publish: "نشر",
  Rollback: "استرجاع",
  Execute: "تنفيذ",
  Export: "تصدير",
  Send: "إرسال",
  Approve: "اعتماد",
  Convert: "تحويل",
  Merge: "دمج",
  Qualify: "تأهيل",
  Search: "بحث",
  Read: "قراءة",
  Write: "كتابة",
  Install: "تثبيت",
  Develop: "تطوير",
  Close: "إغلاق",
  Comment: "تعليق",
  Accept: "قبول",
  Reject: "رفض",
  Escalate: "تصعيد",
  Transfer: "نقل",
  Presence: "حضور",
  Queue: "طابور",
  Simulate: "محاكاة",
};

const moduleAr = {
  Automation: "الأتمتة",
  Leads: "العملاء المحتملين",
  Tickets: "التذاكر",
  Products: "المنتجات",
  Quotes: "عروض الأسعار",
  Opportunities: "الفرص",
  Handoff: "التحويل البشري",
  Organization: "التنظيم",
  Marketplace: "سوق الإضافات",
  Integrations: "التكاملات",
  Governance: "الحوكمة",
  Configuration: "الإعدادات",
  "Feature Flags": "أعلام الميزات",
  Licenses: "التراخيص",
  Operations: "العمليات",
  Tasks: "المهام",
  Skills: "المهارات",
  Agents: "الموظفين الأذكياء",
  Prompts: "قوالب الأوامر",
  Workflow: "سير العمل",
  Reports: "التقارير",
  Executive: "التنفيذي",
  Collaboration: "التعاون",
  Availability: "التوفر",
  Customers: "العملاء",
  Bookings: "الحجوزات",
  Invoices: "الفواتير",
  Users: "المستخدمين",
  Roles: "الأدوار",
  Companies: "الشركات",
  Settings: "الإعدادات",
  Channels: "القنوات",
  Knowledge: "المعرفة",
  WhatsApp: "واتساب",
};

for (const code of englishish) {
  const meta = codes.get(code);
  if (!meta) continue;
  const a = actionAr[meta.action] ?? meta.action;
  const m = moduleAr[meta.module] ?? meta.module;
  ar.codes[code] = {
    ...ar.codes[code],
    name: `${a} ${m}`,
    description: `يسمح بـ: ${a} ${m}.`,
    group: ar.codes[code]?.group ?? groupFor(code),
  };
}

en.codes = sortObj(en.codes);
ar.codes = sortObj(ar.codes);

fs.writeFileSync(enPath, `${JSON.stringify(en, null, 2)}\n`);
fs.writeFileSync(arPath, `${JSON.stringify(ar, null, 2)}\n`);

const stillEnglish = Object.entries(ar.codes)
  .filter(([, v]) => /^[A-Za-z]/.test(v.name))
  .map(([c]) => c);
console.log(
  JSON.stringify(
    {
      added,
      en: Object.keys(en.codes).length,
      ar: Object.keys(ar.codes).length,
      stillEnglish: stillEnglish.length,
    },
    null,
    2,
  ),
);
if (stillEnglish.length) console.log(stillEnglish.join("\n"));
