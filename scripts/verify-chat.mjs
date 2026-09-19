import fs from "node:fs";
const src = fs.readFileSync("src/integrations/supabase/client.ts", "utf8");
const anon = src.match(/SUPABASE_PUBLISHABLE_KEY = "([^"]+)"/)[1];
const URL = "https://spb-t4nz594t9ig4432c.supabase.opentrust.net";

async function post(path, body, token) {
  const res = await fetch(`${URL}${path}`, {
    method: "POST",
    headers: { apikey: anon, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}
async function get(path, token) {
  const res = await fetch(`${URL}${path}`, {
    headers: { apikey: anon, Authorization: `Bearer ${token}` },
  });
  return res.json();
}
async function login(email) {
  const r = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "ResolveAI@123" }),
  });
  return (await r.json()).access_token;
}

(async () => {
  const CT = await login("customer@resolveai.demo");
  const MT = await login("manager@resolveai.demo");

  // 1. Non-complaint
  const g = await post("/functions/v1/resolveai", { route: "chat", start_only: true, message: "Hi there" }, CT);
  console.log("greeting:", g.kind, "| no-case reply:", !!g.reply, "| case_uuid:", g.case_uuid ? "present" : "none");

  // 2. Complaint -> case -> continue -> persisted reply
  const s = await post("/functions/v1/resolveai", { route: "chat", start_only: true, message: "My payment was deducted twice." }, CT);
  const uuid = s.case_uuid, conv = s.conversation_id;
  console.log("complaint start:", s.kind, "| case:", s.case_id, "| resumed:", s.resumed);
  const cont = await post("/functions/v1/resolveai", { route: "chat", case_uuid: uuid, message: "My payment was deducted twice." }, CT);
  console.log("continue:", cont.kind, "|", cont.case_id, "|", cont.status, "| reply-len:", (cont.reply || "").length);

  // 3. Persisted conversation (what the frontend polls for)
  const msgs = await get(`/rest/v1/resolveai_messages?conversation_id=eq.${conv}&select=role,content&order=created_at.asc`, CT);
  const ai = msgs.filter((m) => m.role === "ai" && m.content && m.content.trim().length > 0);
  console.log("persisted msgs:", msgs.length, "| AI replies:", ai.length, "| last:", (ai[ai.length - 1]?.content || "").slice(0, 70));

  // 4. Manager queue sees the case
  const q = await get(`/rest/v1/resolveai_cases?case_id=eq.${cont.case_id}&select=case_id,status,intent`, MT);
  console.log("manager queue:", q.length ? `${q[0].case_id} | ${q[0].status} | ${q[0].intent}` : "MISSING");

  // 5. Self-check regression
  const sc = await post("/functions/v1/resolveai", { route: "selfcheck" }, MT);
  console.log("selfcheck allPass:", sc.allPass);
})().catch((e) => console.error("ERR", e.message));
