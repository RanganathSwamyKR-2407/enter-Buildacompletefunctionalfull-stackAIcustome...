import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Users, FileText, Package, Wallet, CornerDownLeft, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { humanLabel } from "@/lib/format";

interface Hit {
  kind: string;
  title: string;
  subtitle: string;
  to: string;
  icon: React.ReactNode;
}

/**
 * Global command search (Ctrl/Cmd + K) over real data: cases, customers.
 * Nothing is fabricated — results come from the same RLS-scoped tables the
 * pages use.
 */
export function CommandPalette() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [hits, setHits] = useState<Hit[]>([]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        setQ("");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const runSearch = useCallback(async (term: string) => {
    if (!term.trim()) {
      setHits([]);
      return;
    }
    setLoading(true);
    try {
      const like = `%${term.trim().toLowerCase()}%`;
      const [{ data: cases }, { data: customers }, { data: orders }, { data: payments }] = await Promise.all([
        supabase
          .from("resolveai_cases")
          .select("id, case_id, message_text, status")
          .or(`case_id.ilike.${like},message_text.ilike.${like}`)
          .limit(5),
        supabase
          .from("resolveai_customers")
          .select("id, name, customer_code, city")
          .or(`name.ilike.${like},customer_code.ilike.${like}`)
          .limit(5),
        supabase
          .from("resolveai_orders")
          .select("id, order_id, status")
          .ilike("order_id", like)
          .limit(4),
        supabase
          .from("resolveai_payments")
          .select("id, txn_id, status")
          .ilike("txn_id", like)
          .limit(4),
      ]);
      const next: Hit[] = [];
      for (const c of cases ?? []) {
        const row = c as { id: string; case_id: string; message_text: string | null; status: string };
        next.push({ kind: "Case", title: row.case_id, subtitle: `${row.message_text ?? ""} · ${humanLabel(row.status)}`, to: `/investigations/${row.id}`, icon: <FileText className="h-3.5 w-3.5" /> });
      }
      for (const c of customers ?? []) {
        const row = c as { id: string; name: string; customer_code: string; city: string | null };
        next.push({ kind: "Customer", title: row.name, subtitle: `${row.customer_code} · ${row.city ?? ""}`, to: `/customers/${row.id}`, icon: <Users className="h-3.5 w-3.5" /> });
      }
      for (const o of orders ?? []) {
        const row = o as { id: string; order_id: string; status: string };
        next.push({ kind: "Order", title: row.order_id, subtitle: humanLabel(row.status), to: `/orders`, icon: <Package className="h-3.5 w-3.5" /> });
      }
      for (const p of payments ?? []) {
        const row = p as { id: string; txn_id: string; status: string };
        next.push({ kind: "Payment", title: row.txn_id, subtitle: humanLabel(row.status), to: `/payments`, icon: <Wallet className="h-3.5 w-3.5" /> });
      }
      setHits(next);
    } catch {
      setHits([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const debounced = useMemo(() => q, [q]);
  useEffect(() => {
    const t = setTimeout(() => void runSearch(debounced), 180);
    return () => clearTimeout(t);
  }, [debounced, runSearch]);

  const grouped = useMemo(() => {
    const m = new Map<string, Hit[]>();
    for (const h of hits) {
      if (!m.has(h.kind)) m.set(h.kind, []);
      m.get(h.kind)!.push(h);
    }
    return [...m.entries()];
  }, [hits]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        title="Search (Ctrl/⌘ + K)"
        aria-label="Open search"
      >
        <Search className="h-4 w-4" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="top-[12%] max-w-lg translate-y-0 p-0 shadow-pop">
          <DialogTitle className="sr-only">Search ResolveAI</DialogTitle>
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search cases, customers, orders, payments…"
              className="h-11 border-0 shadow-none focus-visible:ring-0"
            />
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          </div>
          <div className="max-h-[320px] overflow-y-auto p-1.5">
            {grouped.length === 0 && q && !loading && (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">No results for “{q}”.</div>
            )}
            {grouped.map(([kind, items]) => (
              <div key={kind} className="mb-1">
                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{kind}</div>
                {items.map((h, i) => (
                  <button
                    key={kind + i}
                    onClick={() => {
                      setOpen(false);
                      navigate(h.to);
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-muted"
                  >
                    <span className="text-muted-foreground">{h.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{h.title}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">{h.subtitle}</span>
                    </span>
                    <CornerDownLeft className="h-3 w-3 text-muted-foreground" />
                  </button>
                ))}
              </div>
            ))}
            {grouped.length === 0 && !q && (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                Search the operations data — cases, customers, orders, payments.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
