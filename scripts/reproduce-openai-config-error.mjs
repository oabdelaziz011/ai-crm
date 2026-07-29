/**
 * Exact OpenAI adapter failure — same message as channel_inbound_events ae9639ee.
 */
import { OpenAIChatAdapter } from "../lib/ai-provider-layer/src/providers/openai-chat-adapter.ts";

const adapter = new OpenAIChatAdapter({ model: "gpt-4o-mini" });

try {
  await adapter.generate({
    prompt: "I want to book an appointment. Please check availability.",
    model: "gpt-4o-mini",
    metadata: { companyId: "2d27f7fb-c15e-4d60-84e9-1793f36f2172" },
  });
} catch (error) {
  console.log("EXCEPTION_TYPE:", error?.constructor?.name);
  console.log("CODE:", error?.code);
  console.log("MESSAGE:", error instanceof Error ? error.message : String(error));
  console.log("STACK:\n", error instanceof Error ? error.stack : "");
}
