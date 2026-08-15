/**
 * Add bilingual (ar/en) copy to clinic WhatsApp flow nodes.
 * Selection IDs stay stable (book/pricing/support); labels localize by conversation.language.
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve("../../.env") });

const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const FLOW_ID = "aef7c4ab-513a-4b64-a700-2be6cf51dafc";
const COMPANY_ID = "2d27f7fb-c15e-4d60-84e9-1793f36f2172";

const { data: flow, error: flowError } = await client
  .from("automation_flows")
  .select("*")
  .eq("id", FLOW_ID)
  .single();
if (flowError) throw flowError;

const { data: ver, error: verError } = await client
  .from("automation_flow_versions")
  .select("id,version_number,snapshot")
  .eq("id", flow.active_version_id)
  .single();
if (verError) throw verError;

const snap = structuredClone(ver.snapshot);
const byId = Object.fromEntries((snap.nodes ?? []).map((n) => [n.id, n]));

function patchNode(idPrefix, patch) {
  const node = (snap.nodes ?? []).find((n) => n.id === idPrefix || n.id.startsWith(idPrefix));
  if (!node) throw new Error(`Missing node ${idPrefix}`);
  node.config = { ...node.config, ...patch };
  return node.id;
}

patchNode("139760cf", {
  message: "اهلا بيك يا فندم اقدر اساعد حضرتك اذاي؟",
  messages: {
    ar: "اهلا بيك يا فندم اقدر اساعد حضرتك ازاي؟",
    en: "Hello! How can I help you today?",
  },
});

patchNode("c397be7d", {
  message: "please press on what you want ",
  messages: {
    ar: "من فضلك اختَر ما تحتاجه:",
    en: "Please choose what you need:",
  },
  buttons: [
    { id: "book", label: "Book Appointment", labelAr: "حجز موعد", labelEn: "Book" },
    { id: "pricing", label: "Pricing", labelAr: "الأسعار", labelEn: "Pricing" },
    { id: "support", label: "Talk to Support", labelAr: "الدعم", labelEn: "Support" },
  ],
});

patchNode("71c6c8a9", {
  message: "what is your phone number?",
  messages: {
    ar: "من فضلك ابعت رقم موبايلك:",
    en: "Please send your phone number:",
  },
});

patchNode("3dd19cca", {
  message: "What is your name?",
  messages: {
    ar: "من فضلك ابعت اسمك:",
    en: "What is your name?",
  },
});

patchNode("f939af78", {
  message: "What is your age?",
  messages: {
    ar: "من فضلك ابعت سنك:",
    en: "What is your age?",
  },
});

patchNode("065993ec", {
  message: "For supporting please call :19666",
  messages: {
    ar: "للدعم برجاء الاتصال على: 19666",
    en: "For support please call: 19666",
  },
});

patchNode("81c534ee", {
  messages: {
    ar: "تم تأكيد الحجز بنجاح ✅\n\nالخدمة: {{booking.service_name}}\nمع: {{booking.resource_name}}\nالتاريخ: {{booking.display_date}}\nالوقت: {{booking.display_time}}\nمرجع الحجز: {{booking.confirmation_code}}",
    en: "Booking confirmed ✅\n\nService: {{booking.service_name}}\nWith: {{booking.resource_name}}\nDate: {{booking.display_date}}\nTime: {{booking.display_time}}\nConfirmation: {{booking.confirmation_code}}",
  },
});

patchNode("0e5c696d", {
  messages: {
    ar: "شكرًا لثقتك {{customer.name}} 👋\nلو محتاج أي تعديل على الموعد، ابعتلنا رسالة.",
    en: "Thank you {{customer.name}} 👋\nIf you need to change the appointment, just send us a message.",
  },
});

for (const node of snap.nodes ?? []) {
  const cfg = node.config ?? {};
  if (cfg.builderType === "list" || cfg.action === "send_list") {
    const lookup = cfg.lookup;
    const bodyText = String(cfg.body ?? cfg.message ?? "");
    if (/gender/i.test(bodyText) || node.id.startsWith("23332e1b")) {
      node.config = {
        ...cfg,
        body: cfg.body ?? "What Is Your Gender?",
        bodies: { ar: "اختَر النوع:", en: "What is your gender?" },
        titles: { ar: "النوع", en: "Gender" },
        buttonLabels: { ar: "عرض الخيارات", en: "View options" },
        sections: Array.isArray(cfg.sections)
          ? cfg.sections.map((section) => ({
              ...section,
              rows: Array.isArray(section.rows)
                ? section.rows.map((row) => {
                    const id = String(row.id ?? "").toLowerCase();
                    const title = String(row.title ?? "");
                    if (id === "male" || /male|ذكر/i.test(title)) {
                      return { ...row, titleAr: "ذكر", titleEn: "Male" };
                    }
                    if (id === "female" || /female|أنثى|انثى/i.test(title)) {
                      return { ...row, titleAr: "أنثى", titleEn: "Female" };
                    }
                    return row;
                  })
                : section.rows,
            }))
          : cfg.sections,
      };
      continue;
    }
    if (lookup === "services") {
      node.config = {
        ...cfg,
        bodies: { ar: "اختَر الخدمة:", en: "Choose a service:" },
        titles: { ar: "الخدمة", en: "Service" },
        buttonLabels: { ar: "عرض الخيارات", en: "View options" },
      };
    } else if (lookup === "resources") {
      node.config = {
        ...cfg,
        bodies: { ar: "اختَر الدكتور:", en: "Choose a doctor:" },
        titles: { ar: "الدكتور", en: "Doctor" },
        buttonLabels: { ar: "عرض الخيارات", en: "View options" },
      };
    } else if (lookup === "available_dates") {
      node.config = {
        ...cfg,
        bodies: { ar: "اختَر اليوم المتاح:", en: "Choose an available date:" },
        titles: { ar: "التاريخ", en: "Date" },
        buttonLabels: { ar: "عرض الخيارات", en: "View options" },
      };
    } else if (lookup === "available_slots") {
      node.config = {
        ...cfg,
        bodies: { ar: "اختَر الوقت المناسب:", en: "Choose a suitable time:" },
        titles: { ar: "الوقت", en: "Time" },
        buttonLabels: { ar: "عرض الخيارات", en: "View options" },
      };
    }
  }
}

void byId;

const { data, error } = await client.rpc("publish_automation_workflow_version", {
  p_flow_id: FLOW_ID,
  p_company_id: COMPANY_ID,
  p_release_notes: "Bilingual AR/EN WhatsApp copy; language from first customer message",
  p_snapshot: snap,
  p_published_by: null,
  p_flow_name: snap.name ?? flow.name,
  p_flow_description: snap.description ?? flow.description ?? "",
  p_flow_trigger_type: snap.triggerType ?? flow.trigger_type,
  p_flow_metadata: snap.metadata ?? flow.metadata ?? {},
  p_updated_by: null,
});
if (error) throw error;
console.log(JSON.stringify({ published: data, fromVersion: ver.version_number }, null, 2));
