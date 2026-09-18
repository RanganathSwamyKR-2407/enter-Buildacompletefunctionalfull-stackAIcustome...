import { useEffect, useState } from "react";
import { NavLink, Outlet, Link, useLocation } from "react-router-dom";
import { useTheme } from "next-themes";
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
  Search,
  Sun,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Home,
} from "lucide-react";
import { useAuth, signOut } from "@/context/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { classNames } from "@/lib/format";
import { ErrorBoundary } from "@/components/error-boundary";
import { CommandPalette } from "@/components/command-palette";
import { api } from "@/lib/api";

const NAV = [
  {
    group: "Operations",
    items: [
      { to: "/queue", label: "Complaint Queue", icon: Inbox },
      { to: "/chat", label: "Customer Chat", icon: MessageSquare },
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
      { to: "/system-health", label: "System Health", icon: ShieldCheck },
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
  const { staffRole, customerId, displayName, avatarUrl } = useAuth();
  const { theme, setTheme } = useTheme();
  const location = useLocation();
  const roleKey = staffRole ?? (customerId ? "customer" : null);
  const isCustomer = Boolean(customerId) && !staffRole;

  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("resolveai.sidebar") === "1");
  const [health, setHealth] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem("resolveai.sidebar", collapsed ? "1" : "0");
  }, [collapsed]);

  useEffect(() => {
    if (!isCustomer) {
      api
        .health()
        .then((h) => setHealth(h.status))
        .catch(() => setHealth("DEGRADED"));
    }
  }, [isCustomer]);

  const current = NAV.flatMap((g) => g.items).find((i) =>
    i.to === "/investigations" ? location.pathname.startsWith("/investigations") : location.pathname.startsWith(i.to),
  );
  const section = isCustomer
    ? { group: "Customer", label: "Customer Chat", to: "/chat" }
    : current ?? { group: "Operations", label: "Complaint Queue", to: "/queue" };

  const visibleNav = isCustomer
    ? [{ group: "My Support", items: [{ to: "/chat", label: "Customer Chat", icon: MessageSquare }] }]
    : NAV;

  const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark");

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-muted/40">
      {/* Sidebar */}
      <aside
        className={classNames(
          "hidden shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 md:flex",
          collapsed ? "w-16" : "w-64",
        )}
      >
        <Link to={isCustomer ? "/chat" : "/queue"} className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand text-brand-foreground shadow-glow">
            <Radio className="h-4 w-4" />
          </span>
          {!collapsed && (
            <>
              <span className="text-sm font-semibold tracking-tight">ResolveAI</span>
              <span className="ml-1 rounded bg-brand-soft px-1.5 py-0.5 text-[10px] font-medium text-brand">
                {isCustomer ? "CUSTOMER" : "OPS"}
              </span>
            </>
          )}
        </Link>
        <nav className="flex-1 overflow-y-auto p-2.5">
          {visibleNav.map((group) => (
            <div key={group.group} className="mb-4">
              {!collapsed && (
                <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
                  {group.group}
                </div>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    title={item.label}
                    className={({ isActive }) =>
                      classNames(
                        "relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors",
                        collapsed && "justify-center px-0",
                        isActive
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-brand" />
                        )}
                        <item.icon className="h-4 w-4 shrink-0" />
                        {!collapsed && <span className="truncate">{item.label}</span>}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="border-t border-sidebar-border p-2.5">
          <Link
            to="/profile"
            className={classNames(
              "flex items-center gap-2 rounded-lg bg-sidebar-accent/60 p-2 transition-colors hover:bg-sidebar-accent",
              collapsed && "justify-center px-1",
            )}
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
            ) : (
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand text-[11px] font-bold text-brand-foreground">
                {(displayName ?? "?").slice(0, 1).toUpperCase()}
              </div>
            )}
            {!collapsed && (
              <>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold">{displayName ?? "Guest"}</div>
                  <div className="text-[11px] text-sidebar-foreground/60">
                    {roleKey ? ROLE_LABEL[roleKey] ?? roleKey : "Signed out"}
                  </div>
                </div>
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); void signOut(); }}
                  className="rounded p-1 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  title="Sign out"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </>
            )}
          </Link>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Command header */}
        <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-card px-4">
          <button
            onClick={() => setCollapsed((v) => !v)}
            className="hidden h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground md:flex"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>

          <nav className="hidden items-center gap-1.5 text-[13px] md:flex">
            <Link to={isCustomer ? "/chat" : "/queue"} className="flex items-center gap-1 text-muted-foreground hover:text-foreground">
              <Home className="h-3.5 w-3.5" />
              {isCustomer ? "Customer" : section.group}
            </Link>
            <span className="text-muted-foreground/50">/</span>
            <span className="font-medium">{section.label}</span>
          </nav>
          <div className="flex items-center gap-2 md:hidden">
            <Link to={isCustomer ? "/chat" : "/queue"} className="font-semibold">ResolveAI</Link>
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            {!isCustomer && health && (
              <span
                className={classNames(
                  "hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium lg:flex",
                  health === "HEALTHY" ? "bg-success-soft text-success" : "bg-warning-soft text-warning",
                )}
              >
                <span className="relative flex h-1.5 w-1.5">
                  <span className={classNames("absolute h-full w-full rounded-full", health === "HEALTHY" ? "animate-ping bg-success opacity-60" : "bg-warning")} />
                  <span className={classNames("relative h-1.5 w-1.5 rounded-full", health === "HEALTHY" ? "bg-success" : "bg-warning")} />
                </span>
                {health === "HEALTHY" ? "Operational" : "Degraded"}
              </span>
            )}
            <CommandPalette />
            <button
              onClick={toggleTheme}
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              title={theme === "dark" ? "Light mode" : "Dark mode"}
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <Button variant="ghost" size="sm" className="hidden h-8 gap-2 px-2 sm:flex">
              <Link to="/profile" className="flex items-center gap-2">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="h-6 w-6 rounded-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                ) : (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-brand-foreground">
                    {(displayName ?? "?").slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span className="text-xs font-medium">{displayName ?? "Guest"}</span>
              </Link>
            </Button>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto p-5">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
