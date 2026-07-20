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
  assistantNameEn: "Vault Assistant",
  assistantNameAr: "مساعد Vault",
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
      "You are a helpful company AI assistant. Respond clearly, accurately, and professionally in English unless the user requests another language.",
    language: "Respond in English unless the user explicitly requests Arabic.",
  },
  ar: {
    system_instructions:
      "أنت مساعد ذكي للشركة. قدم إجابات واضحة ودقيقة ومهنية باللغة العربية ما لم يطلب المستخدم لغة أخرى.",
    language: "Respond in Arabic unless the user explicitly requests English.",
  },
} as const;
