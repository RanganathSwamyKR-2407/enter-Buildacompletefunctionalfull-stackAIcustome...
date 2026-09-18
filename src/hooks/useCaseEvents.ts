import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { CaseEvent, CaseRow } from "@/lib/types";

const dedupeById = (list: CaseEvent[]): CaseEvent[] => {
  const seen = new Set<string>();
  const out: CaseEvent[] = [];
  for (const ev of list) {
    if (!ev || !ev.id || seen.has(ev.id)) continue;
    seen.add(ev.id);
    out.push(ev);
  }
  return out.sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""));
};

/**
 * Live-subscribe to a case's investigation events (Postgres changes on
 * resolveai_case_events) and its Case Twin updates (resolveai_cases).
 *
 * Safety rules:
 * - never subscribes with an undefined/null case id;
 * - case UPDATE payloads may be partial (realtime only sends changed
 *   columns) so they are MERGED into the existing Case Twin, never replace it;
 * - on (re)SUBSCRIBED (initial connect and realtime reconnect) the persisted
 *   state is refetched and merged, so late joiners and reconnects converge;
 * - events are deduplicated by id.
 */
export function useCaseEvents(caseUuid: string | null) {
  const [events, setEvents] = useState<CaseEvent[]>([]);
  const [caseRow, setCaseRow] = useState<CaseRow | null>(null);
  const [connected, setConnected] = useState(false);
  const loadedOnceRef = useRef(false);

  const loadPersisted = useCallback(async () => {
    if (!caseUuid) return;
    const [{ data: eventsData }, { data: caseData }] = await Promise.all([
      supabase
        .from("resolveai_case_events")
        .select("*")
        .eq("case_id", caseUuid)
        .order("created_at", { ascending: true }),
      supabase.from("resolveai_cases").select("*").eq("id", caseUuid).maybeSingle(),
    ]);
    // Merge: combine persisted records with anything already received.
    setEvents((prev) => dedupeById([...(eventsData ?? []), ...prev]));
    setCaseRow((prev) => ({ ...((caseData ?? prev ?? {}) as CaseRow), ...(prev ?? {}) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseUuid]);

  useEffect(() => {
    if (!caseUuid) {
      setEvents([]);
      setCaseRow(null);
      setConnected(false);
      return;
    }
    loadedOnceRef.current = false;

    const channel = supabase
      .channel(`case-events-${caseUuid}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "resolveai_case_events", filter: `case_id=eq.${caseUuid}` },
        (payload) => {
          const ev = payload.new as CaseEvent;
          if (!ev?.id) return;
          setEvents((prev) => dedupeById([...prev, ev]));
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "resolveai_cases", filter: `id=eq.${caseUuid}` },
        (payload) => {
          const update = payload.new as Partial<CaseRow>;
          // Partial realtime payload → merge into the existing Case Twin.
          setCaseRow((prev) => ({ ...((prev ?? {}) as CaseRow), ...(update as CaseRow) }));
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setConnected(true);
          // Initial load + reconnect: reconcile with persisted state.
          if (!loadedOnceRef.current) {
            loadedOnceRef.current = true;
            void loadPersisted();
          } else {
            void loadPersisted();
          }
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setConnected(false);
        }
      });

    return () => {
      setConnected(false);
      supabase.removeChannel(channel);
    };
  }, [caseUuid, loadPersisted]);

  return { events, caseRow, connected };
}
