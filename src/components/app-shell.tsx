import { NavLink, Outlet, Link } from "react-router-dom";
import {
  MessageSquare,
  Inbox,
  Activity,
  Users,
  Package,
  Wallet,
  ShieldCheck,
  Radar,
  BarChart3,
  LifeBuoy,
  ScrollText,
  FlaskConical,
  LogOut,
  Radio,
} from "lucide-react";
import { useAuth, signOut } from "@/context/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { classNames } from "@/lib/format";

const NAV = [
  {
    group: "Operations",
    items: [
      { to: "/chat", label: "Customer Chat", icon: MessageSquare },
      { to: "/queue", label: "Complaint Queue", icon: Inbox },
      { to: "/investigations", label: "Live Investigations", icon: Activity },
    ],
  },
  {
    group: "Customers & Commerce",
    items: [
      { to: "/customers", label: "Customers", icon: Users },
      { to: "/orders", label: "Orders & Shipments", icon: Package },
      { to: "/payments", label: "Payments & Refunds", icon: Wallet },
    ],
  },
  {
    group: "Intelligence",
    items: [
      { to: "/policies", label: "Policy Engine", icon: ShieldCheck },
      { to: "/incidents", label: "Incident Detection", icon: Radar },
      { to: "/analytics", label: "Operational Analytics", icon: BarChart3 },
    ],
  },
  {
    group: "Human Oversight",
    items: [
      { to: "/escalations", label: "Escalations", icon: LifeBuoy },
      { to: "/audit", label: "Audit Trail", icon: ScrollText },
      { to: "/selfcheck", label: "Demo Self-Check", icon: FlaskConical },
    ],
  },
];

const ROLE_LABEL: Record<string, string> = {
  customer: "Customer",
  customer_support_t1: "Tier-1 Agent",
  customer_support_t2: "Tier-2 Agent",
  manager: "Manager",
  admin: "Administrator",
};

export function AppShell() {
  const { staffRole, customerId, displayName } = useAuth();
  const roleKey = staffRole ?? (customerId ? "customer" : null);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-muted/30">
      {/* Sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
        <Link to="/queue" className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-brand text-brand-foreground">
            <Radio className="h-4 w-4" />
          </span>
          <span className="text-sm font-semibold tracking-tight">ResolveAI</span>
          <span className="ml-1 rounded bg-brand-soft px-1.5 py-0.5 text-[10px] font-medium text-brand">
            OPS
          </span>
        </Link>
        <nav className="flex-1 overflow-y-auto p-3">
          {NAV.map((group) => (
            <div key={group.group} className="mb-4">
              <div className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
                {group.group}
              </div>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      classNames(
                        "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors",
                        isActive
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                      )
                    }
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="border-t border-sidebar-border p-3">
          <div className="flex items-center gap-2 rounded-md bg-sidebar-accent/60 p-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand text-[11px] font-bold text-brand-foreground">
              {(displayName ?? "?").slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold">{displayName ?? "Guest"}</div>
              <div className="text-[11px] text-sidebar-foreground/60">
                {roleKey ? ROLE_LABEL[roleKey] ?? roleKey : "Signed out"}
              </div>
            </div>
            <button
              onClick={() => void signOut()}
              className="rounded p-1 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b bg-card px-5">
          <div className="flex items-center gap-2 md:hidden">
            <Link to="/queue" className="font-semibold">ResolveAI</Link>
          </div>
          <div className="hidden items-center gap-2 text-[13px] text-muted-foreground md:flex">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
            </span>
            Autonomous support engine · realtime
          </div>
          <div className="flex items-center gap-2">
            {roleKey && (
              <Badge className="bg-brand-soft text-brand font-medium">{ROLE_LABEL[roleKey] ?? roleKey}</Badge>
            )}
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto p-5">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
