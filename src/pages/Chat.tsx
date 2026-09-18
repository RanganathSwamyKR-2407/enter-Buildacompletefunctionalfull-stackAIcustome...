import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { ChatWindow, type ChatBubble } from "@/components/chat-window";
import { PageHeader } from "@/components/widgets";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge, IntentBadge, PriorityBadge } from "@/components/badges";
import type { Customer, Message } from "@/lib/types";
import { fmtDate, inr, timeAgo } from "@/lib/format";

const SUGGESTIONS = [
  "I was charged twice for my order. The order is still pending and I already contacted support twice.",
  "The courier says delivered but I never received my package.",
  "My order is delayed and I have not received any update.",
];

export default function Chat() {
  const { customerId, staffRole } = useAuth();
  const [customerIdState, setCustomerId] = useState<string | null>(customerId);
  const [customerSearch, setCustomerSearch] = useState("");
  const [bubbles, setBubbles] = useState<ChatBubble[]>([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setCustomerId(customerId);
  }, [customerId]);

  // Staff can pick any seeded customer for demo purposes.
  const { data: allCustomers } = useQuery({
    queryKey: ["customers-mini"],
    queryFn: async () => {
      const { data } = await supabase.from("resolveai_customers").select("id, name, customer_code, tier").order("customer_code").limit(30);
      return (data ?? []) as Customer[];
    },
    enabled: Boolean(staffRole),
  });

  const { data: customer } = useQuery({
    queryKey: ["chat-customer", customerIdState],
    queryFn: async () => {
      if (!customerIdState) return null;
      const { data } = await supabase.from("resolveai_customers").select("*").eq("id", customerIdState).maybeSingle();
      return (data ?? null) as Customer | null;
    },
    enabled: Boolean(customerIdState),
  });

  const { data: messages } = useQuery({
    queryKey: ["chat-messages", customerIdState],
    queryFn: async () => {
      if (!customerIdState) return [];
      const { data: conv } = await supabase
        .from("resolveai_conversations")
        .select("id")
        .eq("customer_id", customerIdState)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!conv) return [];
      const { data: msgs } = await supabase
        .from("resolveai_messages")
        .select("*")
        .eq("conversation_id", (conv as { id: string }).id)
        .order("created_at", { ascending: true });
      return (msgs ?? []) as Message[];
    },
    enabled: Boolean(customerIdState),
  });

  const { data: tickets } = useQuery({
    queryKey: ["chat-tickets", customerIdState],
    queryFn: async () => {
      if (!customerIdState) return [];
      const { data } = await supabase.from("resolveai_tickets").select("*").eq("customer_id", customerIdState).order("created_at", { ascending: false }).limit(5);
      return data ?? [];
    },
    enabled: Boolean(customerIdState),
  });

  const { data: openCases } = useQuery({
    queryKey: ["chat-open-cases", customerIdState],
    queryFn: async () => {
      if (!customerIdState) return [];
      const { data } = await supabase
        .from("resolveai_cases")
        .select("*")
        .eq("customer_id", customerIdState)
        .order("created_at", { ascending: false })
        .limit(5);
      return data ?? [];
    },
    enabled: Boolean(customerIdState),
  });

  const initialBubbles = useMemo<ChatBubble[]>(() => {
    if (!messages || messages.length === 0) return [];
    return messages.map((m) => ({
      id: m.id,
      role: m.role === "customer" ? "user" : "assistant",
      content: m.content,
    }));
  }, [messages]);

  const send = async (text: string) => {
    setSending(true);
    setBubbles((prev) => [...prev, { id: `u-${Date.now()}`, role: "user", content: text }]);
    try {
      const res = await api.chat(text, customerIdState ?? undefined);
      setBubbles((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: res.reply,
          status: `${res.status} · ${res.resolution_status ?? ""}`,
          caseId: res.case_id,
          caseUuid: res.case_uuid,
          investigationLink: res.case_uuid ? `/investigations/${res.case_uuid}` : undefined,
        },
      ]);
    } catch (e) {
      setBubbles((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: "assistant",
          content: `An error occurred: ${e instanceof Error ? e.message : String(e)}`,
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="h-full">
      <PageHeader
        title="Customer Chat"
        subtitle="Every message is processed by the autonomous engine — no canned replies."
      />
      <div className="grid h-[calc(100vh-8.5rem)] min-h-[520px] gap-4 lg:grid-cols-[300px_1fr]">
        {/* Context sidebar */}
        <div className="flex flex-col gap-3 overflow-y-auto">
          {staffRole && allCustomers && (
            <Card>
              <CardContent className="p-3">
                <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Act as customer (staff demo)
                </label>
                <input
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  placeholder="Search customers…"
                  className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-[13px]"
                />
                <select
                  value={customerIdState ?? ""}
                  onChange={(e) => {
                    setCustomerId(e.target.value);
                    setBubbles([]);
                  }}
                  className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-[13px]"
                >
                  <option value="">— choose customer —</option>
                  {(allCustomers as Customer[])
                    .filter((c) => !customerSearch || `${c.name} ${c.customer_code}`.toLowerCase().includes(customerSearch.toLowerCase()))
                    .slice(0, 6)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.customer_code} — {c.name}
                      </option>
                    ))}
                </select>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  Showing up to 6 of {(allCustomers as Customer[]).length} — search to narrow.
                </div>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader className="py-2.5">
              <CardTitle className="text-sm">Customer context</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 p-3 text-[13px]">
              {customer ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{customer.name}</span>
                    <Badge className={customer.tier === "gold" ? "bg-warning-soft text-warning" : "bg-brand-soft text-brand"}>
                      {customer.tier}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">{customer.customer_code} · {customer.city ?? "—"}</div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Lifetime value</span>
                    <span className="font-medium">{inr(customer.lifetime_value)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Previous tickets</span>
                    <span className="font-medium">{(tickets ?? []).length}</span>
                  </div>
                </>
              ) : (
                <div className="text-xs text-muted-foreground">Select a customer to begin.</div>
              )}
              <div className="pt-1">
                <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Previous interactions
                </div>
                {(tickets ?? []).slice(0, 3).map((t) => (
                  <div key={t.id} className="rounded border px-2 py-1 text-xs">
                    <div className="font-medium">{t.subject}</div>
                    <div className="text-muted-foreground">{timeAgo(t.created_at)} · {t.status}</div>
                  </div>
                ))}
                {(tickets ?? []).length === 0 && <div className="text-xs text-muted-foreground">None</div>}
              </div>
              <div className="pt-1">
                <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Open cases
                </div>
                {(openCases ?? []).slice(0, 3).map((c) => (
                  <div key={c.id} className="flex items-center justify-between rounded border px-2 py-1 text-xs">
                    <Link to={`/investigations/${c.id}`} className="font-medium text-brand hover:underline">
                      {c.case_id}
                    </Link>
                    <StatusBadge status={c.status} />
                  </div>
                ))}
                {(openCases ?? []).length === 0 && <div className="text-xs text-muted-foreground">None</div>}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Latest chat
              </div>
              {initialBubbles.length > 0 && (
                <div className="space-y-1">
                  {initialBubbles.slice(-6).map((b) => (
                    <div key={b.id} className="truncate rounded border px-2 py-1 text-xs">
                      <span className="font-medium">{b.role === "user" ? "You" : "AI"}:</span> {b.content}
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-2 text-xs text-muted-foreground">
                {messages?.length ? `Conversation saved · ${fmtDate(messages[messages.length - 1].created_at)}` : "No messages yet."}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Chat */}
        <Card className="min-w-0">
          <CardContent className="h-full p-0">
            <ChatWindow
              bubbles={bubbles.length > 0 ? bubbles : initialBubbles}
              sending={sending}
              onSend={send}
              disabled={!customerIdState}
              placeholder={customerIdState ? "Describe your issue…" : "Select a customer to begin"}
              suggested={SUGGESTIONS}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
