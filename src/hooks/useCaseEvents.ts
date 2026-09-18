import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { CaseEvent, CaseRow } from "@/lib/types";

/**
 * Live-subscribe to a case's investigation events (Postgres changes on
 * resolveai_case_events) and its Case Twin updates (resolveai_cases).
 */
export function useCaseEvents(caseUuid: string | null) {
  const [events, setEvents] = useState<CaseEvent[]>([]);
  const [caseRow, setCaseRow] = useState<CaseRow | null>(null);
  const [connected, setConnected] = useState(false);
  const loadedOnce = useRef(false);

  useEffect(() => {
    if (!caseUuid) return;
    loadedOnce.current = false;

    const channel = supabase
      .channel(`case-events-${caseUuid}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "resolveai_case_events", filter: `case_id=eq.${caseUuid}` },
        (payload) => {
          const ev = payload.new as CaseEvent;
          setEvents((prev) => {
            if (prev.some((e) => e.id === ev.id)) return prev;
            return [...prev, ev].sort((a, b) => a.created_at.localeCompare(b.created_at));
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "resolveai_cases", filter: `id=eq.${caseUuid}` },
        (payload) => {
          setCaseRow(payload.new as CaseRow);
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setConnected(true);
      });

    // Initial backfill
    const load = async () => {
      if (loadedOnce.current) return;
      loadedOnce.current = true;
      const [{ data: eventsData }, { data: caseData }] = await Promise.all([
        supabase
          .from("resolveai_case_events")
          .select("*")
          .eq("case_id", caseUuid)
          .order("created_at", { ascending: true }),
        supabase.from("resolveai_cases").select("*").eq("id", caseUuid).maybeSingle(),
      ]);
      setEvents((eventsData ?? []) as CaseEvent[]);
      setCaseRow((caseData ?? null) as CaseRow | null);
    };
    void load();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [caseUuid]);

  return { events, caseRow, connected };
}
