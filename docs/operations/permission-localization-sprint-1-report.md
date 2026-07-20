# Enterprise Permission Localization — Sprint 1 Report

## Summary

- **Catalog entries:** 104
- **Catalog files:** rtifacts/login-app/src/locales/en/permission-catalog.json, rtifacts/login-app/src/locales/ar/permission-catalog.json
- **Display helpers:** rtifacts/login-app/src/lib/rbac/permission-display-i18n.ts
- **Developer mode:** localStorage key aultos.rbac.developerMode

## Affected screens (screenshot checklist)

1. **Roles page** — /dashboard/roles — developer mode toggle, role list, expandable permission badges
2. **Create role dialog** — localized permission groups + selector
3. **Edit role dialog** — assigned permission badges + selector
4. **Access denied page** — localized required permission label (code only in developer mode)

## Permission groups (display order)

- 👥 **Customers** (customers)
- 📅 **Bookings** (bookings)
- 💳 **Invoices** (invoices)
- 📊 **Reports** (reports)
- 🏢 **Workspace** (workspace)
- 💰 **Billing & Subscriptions** (billing)
- 👤 **Users** (users)
- 🛡️ **Roles & Permissions** (roles)
- 🏛️ **Companies** (companies)
- ⚙️ **Settings** (settings)
- 📋 **Audit Logs** (audit)
- 🤖 **AI Assistant** (aiAssistant)
- 💬 **AI Chat** (aiChat)
- 📥 **Conversations** (conversations)
- 📡 **Channels** (channels)
- 📚 **Knowledge** (knowledge)
- 📱 **WhatsApp** (whatsapp)
- 📈 **AI Analytics & Costs** (aiAnalytics)
- 🔧 **AI Platform Services** (aiPlatform)

## Full catalog (104 permissions)

| Code | EN Name | AR Name | Group |
|---|---|---|---|
| ai.analytics.manage | Manage AI Analytics | إدارة تحليلات الذكاء الاصطناعي | aiAnalytics |
| ai.analytics.view | View AI Analytics | عرض تحليلات الذكاء الاصطناعي | aiAnalytics |
| ai.conversations.release | Release Conversations | إسناد المحادثات للذكاء الاصطناعي | conversations |
| ai.conversations.reply | Reply in Conversations | الرد على المحادثات | conversations |
| ai.conversations.takeover | Take Over Conversations | استلام المحادثات | conversations |
| ai.conversations.view | View Conversations | عرض المحادثات | conversations |
| ai.costs.view | View AI Costs | عرض تكاليف الذكاء الاصطناعي | aiAnalytics |
| ai.execution.manage | Manage AI Executions | إدارة تنفيذات الذكاء الاصطناعي | aiPlatform |
| ai.execution.view | View AI Executions | عرض تنفيذات الذكاء الاصطناعي | aiPlatform |
| ai.knowledge.manage | Manage AI Knowledge (Legacy) | إدارة معرفة الذكاء الاصطناعي (قديم) | knowledge |
| ai.providers.manage | Manage AI Providers | إدارة مزودي الذكاء الاصطناعي | aiPlatform |
| ai.providers.view | View AI Providers | عرض مزودي الذكاء الاصطناعي | aiPlatform |
| ai.whatsapp.manage | Manage WhatsApp Integration (Legacy) | إدارة تكامل واتساب (قديم) | channels |
| ai_assistant.edit | Edit AI Assistant | تعديل المساعد الذكي | aiAssistant |
| ai_assistant.view | View AI Assistant | عرض المساعد الذكي | aiAssistant |
| ai_chat.use | Use AI Chat | استخدام الدردشة الذكية | aiChat |
| ai_chat.view | View AI Chat | عرض الدردشة الذكية | aiChat |
| audit_logs.view | View Audit Logs | عرض سجلات التدقيق | audit |
| billing.audit.export | Export Billing Audit Log | تصدير سجل تدقيق الفوترة | billing |
| billing.audit.view | View Billing Audit Log | عرض سجل تدقيق الفوترة | billing |
| billing.contact.edit_own | Edit Billing Contact | تعديل جهة الفوترة | billing |
| billing.documents.download_own | Download Billing Documents | تنزيل مستندات الفوترة | billing |
| billing.edit | Manage Billing (Platform) | إدارة الفوترة (المنصة) | billing |
| billing.features.edit | Edit Feature Entitlements | تعديل صلاحيات الميزات | billing |
| billing.features.manage_catalog | Manage Feature Catalog | إدارة كatalog الميزات | billing |
| billing.features.view | View Feature Entitlements | عرض صلاحيات الميزات | billing |
| billing.health.manage | Manage Billing Health | إدارة صحة الفوترة | billing |
| billing.health.view | View Billing Health | عرض صحة الفوترة | billing |
| billing.manage_own | Manage Own Subscription | إدارة الاشتراك الخاص | billing |
| billing.manage_plans | Manage Subscription Plans | إدارة خطط الاشتراك | billing |
| billing.payment_method.manage_own | Manage Payment Methods | إدارة طرق الدفع | billing |
| billing.record_payment | Record Payments | تسجيل المدفوعات | billing |
| billing.settings.edit | Edit Billing Settings | تعديل إعدادات الفوترة | billing |
| billing.settings.view | View Billing Settings | عرض إعدادات الفوترة | billing |
| billing.view | View Billing (Platform) | عرض الفوترة (المنصة) | billing |
| billing.view_own | View Own Billing | عرض الفوترة الخاصة | billing |
| billing.view_reports | View Billing Reports | عرض تقارير الفوترة | billing |
| billing.webhooks.manage | Manage Billing Webhooks | إدارة webhooks الفوترة | billing |
| billing.webhooks.view | View Billing Webhooks | عرض webhooks الفوترة | billing |
| bookings.create | Create Bookings | إنشاء الحجوزات | bookings |
| bookings.delete | Delete Bookings | حذف الحجوزات | bookings |
| bookings.edit | Edit Bookings | تعديل الحجوزات | bookings |
| bookings.view | View Bookings | عرض الحجوزات | bookings |
| channel.platform.dispatch | Dispatch Channel Messages | إرسال رسائل القنوات | aiPlatform |
| channel.platform.route | Route Channel Events | توجيه أحداث القنوات | aiPlatform |
| channel.platform.view | View Channel Platform | عرض منصة القنوات | aiPlatform |
| channels.manage | Manage Channels | إدارة القنوات | channels |
| channels.view | View Channels | عرض القنوات | channels |
| collections.manage | Manage Collections | إدارة المجموعات | aiPlatform |
| companies.create | Create Companies | إنشاء الشركات | companies |
| companies.delete | Delete Companies | حذف الشركات | companies |
| companies.edit | Edit Companies | تعديل الشركات | companies |
| companies.view | View Companies | عرض الشركات | companies |
| customers.create | Create Customers | إنشاء العملاء | customers |
| customers.delete | Delete Customers | حذف العملاء | customers |
| customers.edit | Edit Customers | تعديل العملاء | customers |
| customers.view | View Customers | عرض العملاء | customers |
| embeddings.generate | Generate Embeddings | إنشاء التضمينات | aiPlatform |
| embeddings.manage | Manage Embeddings | إدارة التضمينات | aiPlatform |
| embeddings.view | View Embeddings | عرض التضمينات | aiPlatform |
| intents.manage | Manage Intents | إدارة النوايا | aiPlatform |
| intents.view | View Intents | عرض النوايا | aiPlatform |
| invoices.create | Create Invoices | إنشاء الفواتير | invoices |
| invoices.delete | Delete Invoices | حذف الفواتير | invoices |
| invoices.edit | Edit Invoices | تعديل الفواتير | invoices |
| invoices.view | View Invoices | عرض الفواتير | invoices |
| knowledge.import | Import Knowledge | استيراد المعرفة | knowledge |
| knowledge.manage | Manage Knowledge Base | إدارة قاعدة المعرفة | knowledge |
| knowledge.publish | Publish Knowledge | نشر المعرفة | knowledge |
| knowledge.view | View Knowledge Base | عرض قاعدة المعرفة | knowledge |
| permissions.edit | Edit User Permissions (Legacy) | تعديل صلاحيات المستخدم (قديم) | roles |
| permissions.view | View User Permissions (Legacy) | عرض صلاحيات المستخدم (قديم) | roles |
| prompts.manage | Manage Prompt Templates | إدارة قوالب المطالبات | aiPlatform |
| prompts.view | View Prompt Templates | عرض قوالب المطالبات | aiPlatform |
| reports.view | View Reports | عرض التقارير | reports |
| retrieval.execute | Execute Retrieval | تنفيذ الاسترجاع | aiPlatform |
| retrieval.manage | Manage Retrieval | إدارة الاسترجاع | aiPlatform |
| retrieval.view | View Retrieval | عرض الاسترجاع | aiPlatform |
| roles.create | Create Roles | إنشاء الأدوار | roles |
| roles.delete | Delete Roles | حذف الأدوار | roles |
| roles.edit | Edit Roles | تعديل الأدوار | roles |
| roles.view | View Roles | عرض الأدوار | roles |
| runtime.execute | Execute AI Runtime | تشغيل محرك الذكاء الاصطناعي | aiPlatform |
| runtime.manage | Manage AI Runtime | إدارة محرك التشغيل | aiPlatform |
| runtime.view | View AI Runtime | عرض محرك التشغيل | aiPlatform |
| settings.edit | Edit Settings | تعديل الإعدادات | settings |
| settings.view | View Settings | عرض الإعدادات | settings |
| subscriptions.edit | Edit Subscriptions (Legacy) | تعديل الاشتراكات (قديم) | billing |
| subscriptions.view | View Subscriptions (Legacy) | عرض الاشتراكات (قديم) | billing |
| tools.execute | Execute Tools | تنفيذ الأدوات | aiPlatform |
| tools.manage | Manage Tools | إدارة الأدوات | aiPlatform |
| tools.view | View Tools | عرض الأدوات | aiPlatform |
| users.create | Create Users | إنشاء المستخدمين | users |
| users.delete | Delete Users | حذف المستخدمين | users |
| users.edit | Manage Users | إدارة المستخدمين | users |
| users.view | View Users | عرض المستخدمين | users |
| vectorquery.execute | Execute Vector Queries | تنفيذ استعلامات المتجهات | aiPlatform |
| vectorquery.manage | Manage Vector Queries | إدارة استعلامات المتجهات | aiPlatform |
| vectorquery.view | View Vector Queries | عرض استعلامات المتجهات | aiPlatform |
| vectorstores.manage | Manage Vector Stores | إدارة مخازن المتجهات | aiPlatform |
| vectorstores.view | View Vector Stores | عرض مخازن المتجهات | aiPlatform |
| whatsapp.run | Run WhatsApp Automation (Legacy) | تشغيل أتمتة واتساب (قديم) | whatsapp |
| whatsapp.view | View WhatsApp Automation | عرض أتمتة واتساب | whatsapp |
| workspace.view | Access Workspace | الوصول إلى بيئة العمل | workspace |