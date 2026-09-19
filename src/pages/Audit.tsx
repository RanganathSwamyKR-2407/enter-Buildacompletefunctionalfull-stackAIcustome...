import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, TableSkeleton } from "@/components/widgets";
import { AuditTimeline } from "@/components/audit-timeline";
import { Link } from "react-router-dom";
import type { AuditLog } from "@/lib/types";

export default function Audit() {
  const { data: logs, isLoading } = useQuery({
    queryKey: ["audit-global"],
    queryFn: async () => {
      const { data } = await supabase.from("resolveai_audit_logs").select("*").order("created_at", { ascending: false }).limit(100);
      return (data ?? []) as AuditLog[];
    },
  });

  if (isLoading) return <TableSkeleton rows={6} />;

  return (
    <div>
      <PageHeader
        title="Audit Trail"
        subtitle="Every important operation is recorded: actor, agent, decision, gates, result, verification."
      />
      <AuditTimeline logs={logs ?? []} limit={60} />
    </div>
  );
}
