import { Navigate } from "react-router-dom";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/context/AuthContext";
import Login from "@/pages/Login";
import ResetPassword from "@/pages/ResetPassword";
import Chat from "@/pages/Chat";
import Queue from "@/pages/Queue";
import Investigation from "@/pages/Investigation";
import Customers, { CustomerDetail } from "@/pages/Customers";
import Orders from "@/pages/Orders";
import Payments from "@/pages/Payments";
import Policies from "@/pages/Policies";
import Incidents from "@/pages/Incidents";
import Analytics from "@/pages/Analytics";
import Escalations from "@/pages/Escalations";
import Audit from "@/pages/Audit";
import SelfCheck from "@/pages/SelfCheck";
import SystemHealthPage from "@/pages/SystemHealth";
import Profile from "@/pages/Profile";
import NotFound from "@/pages/NotFound";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
        Restoring session…
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function HomeRedirect() {
  const { staffRole, customerId, loading } = useAuth();
  if (loading) return null;
  // Customers land on their chat; staff land on the operations queue.
  return <Navigate to={staffRole ? "/queue" : customerId ? "/chat" : "/login"} replace />;
}

export const routers = [
  {
    path: "/login",
    element: <Login />,
  },
  {
    path: "/reset-password",
    element: <ResetPassword />,
  },
  {
    path: "/",
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <HomeRedirect /> },
      { path: "chat", element: <Chat /> },
      { path: "queue", element: <Queue /> },
      { path: "investigations", element: <Navigate to="/queue" replace /> },
      { path: "investigations/:caseId", element: <Investigation /> },
      { path: "customers", element: <Customers /> },
      { path: "customers/:id", element: <CustomerDetail /> },
      { path: "orders", element: <Orders /> },
      { path: "payments", element: <Payments /> },
      { path: "policies", element: <Policies /> },
      { path: "incidents", element: <Incidents /> },
      { path: "analytics", element: <Analytics /> },
      { path: "escalations", element: <Escalations /> },
      { path: "audit", element: <Audit /> },
      { path: "selfcheck", element: <SelfCheck /> },
      { path: "system-health", element: <SystemHealthPage /> },
      { path: "profile", element: <Profile /> },
    ],
  },
  {
    path: "*",
    element: <NotFound />,
  },
];

declare global {
  interface Window {
    __routers__: typeof routers;
  }
}

window.__routers__ = routers;
