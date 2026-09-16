import { randomUUID } from "node:crypto";
const URL = "https://webhook.valueor.org/api/webhooks/whatsapp/e126113b-6d0e-48d3-9296-a46aafe0cc75";
const payload = {
  object: "whatsapp_business_account",
  entry: [{ changes: [{ field: "messages", value: {
    messaging_product: "whatsapp",
    metadata: { phone_number_id: "1214681355059951", display_phone_number: "201012345989" },
    messages: [{ from: "201011404109", id: `wamid.probe.${randomUUID()}`, timestamp: "1", type: "text", text: { body: "probe" } }],
  }}]}],
};
const res = await fetch(URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
console.log(JSON.stringify({ status: res.status, body: (await res.text()).slice(0, 500) }));
