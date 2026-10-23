export const TENANT_AI_BOOTSTRAP_RPC = "provision_tenant_ai_bootstrap" as const;
export const TENANT_AI_REPAIR_RPC = "repair_tenant_ai_bootstrap" as const;

export const DEFAULT_COLLECTION_NAME = "knowledge_default" as const;
export const DEFAULT_COLLECTION_DIMENSIONS = 1536;
export const DEFAULT_EMBEDDING_VERSION = 1;

export const DEFAULT_AI_PROVIDER_KEY = "openai" as const;
export const DEFAULT_EMBEDDING_PROVIDER_KEY = "openai" as const;
export const DEFAULT_VECTOR_STORE_KEY = "pgvector" as const;

export const DEFAULT_AI_MODEL = "gpt-4o-mini";
export const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";

export const DEFAULT_RETRIEVAL_POLICY_NAME = "tenant_default_retrieval";
export const DEFAULT_EXECUTION_POLICY_NAME = "tenant_default_runtime";
export const DEFAULT_VECTOR_SEARCH_POLICY_NAME = "tenant_default_search";

export const TENANT_PROMPT_TEMPLATE_KEYS = {
  conversationEn: "tenant_conversation_en",
  conversationAr: "tenant_conversation_ar",
} as const;

export const DEFAULT_ASSISTANT_SETTINGS = {
  assistantNameEn: "ValueOR Assistant",
  assistantNameAr: "مساعد ValueOR",
  welcomeMessageEn: "Hello! I'm your AI assistant. How can I help you today?",
  welcomeMessageAr: "مرحباً! أنا مساعدك الذكي. كيف يمكنني مساعدتك اليوم؟",
  fallbackMessageEn: "I'm sorry, I didn't understand that. Could you please rephrase your question?",
  fallbackMessageAr: "عذراً، لم أفهم ذلك. هل يمكنك إعادة صياغة سؤالك؟",
  model: "gpt-5.5",
  temperature: 0.3,
  maxTokens: 1000,
} as const;

export const TENANT_PROMPT_SECTIONS = {
  en: {
    system_instructions:
      "You are a helpful company AI assistant. Respond clearly, accurately, and professionally in the language of the customer's latest clear message.",
    language:
      "Reply in the language of the customer's latest clear message. A short acknowledgement or a personal or company name does not change the language. Do not switch to Arabic only because the dashboard is Arabic.",
  },
  ar: {
    system_instructions:
      "أنت مساعد ذكي للشركة. ارد بلغة آخر رسالة واضحة من العميل. لا تفترض العربية إلا إذا كتب العميل بالعربية.",
    language:
      "ارد بلغة آخر رسالة واضحة من العميل. الإقرار القصير أو اسم الشخص أو الشركة لا يغيّران اللغة. لا تتحول إلى العربية لمجرد أن لوحة التحكم عربية.",
  },
} as const;
