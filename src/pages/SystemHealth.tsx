import { PageHeader } from "@/components/widgets";
import { SystemHealth } from "@/components/health-demo";
import { ShieldCheck } from "lucide-react";

/**
 * Dedicated System Health page — read-only infrastructure diagnostics.
 * Distinct from Demo Self-Check (which validates business scenarios).
 */
export default function SystemHealthPage() {
  return (
    <div>
      <PageHeader
        title="System Health"
        subtitle="Read-only diagnostics across the ResolveAI infrastructure — database, authentication, AI, RAG, actions, verification, realtime, analytics and audit."
        actions={
          <span className="flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" /> Diagnostic only — no data is modified
          </span>
        }
      />
      <SystemHealth />
    </div>
  );
}
