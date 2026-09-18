import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

export interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  staffRole: string | null;
  customerId: string | null;
  displayName: string | null;
}

const AuthContext = createContext<AuthState>({
  user: null,
  session: null,
  loading: true,
  staffRole: null,
  customerId: null,
  displayName: null,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [staffRole, setStaffRole] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);

  const loadIdentity = useCallback(async (uid: string) => {
    try {
      const { data: staff } = await supabase
        .from("resolveai_staff")
        .select("role, name")
        .eq("user_id", uid)
        .maybeSingle();
      if (staff) {
        setStaffRole((staff as { role: string }).role);
        setDisplayName((staff as { name: string }).name);
        return;
      }
      const { data: customer } = await supabase
        .from("resolveai_customers")
        .select("id, name")
        .eq("user_id", uid)
        .maybeSingle();
      if (customer) {
        setCustomerId((customer as { id: string }).id);
        setDisplayName((customer as { name: string }).name);
      }
    } catch {
      // identity lookup failure — leave unset
    }
  }, []);

  useEffect(() => {
    supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        setStaffRole(null);
        setCustomerId(null);
        setDisplayName(null);
        // Deferred call (deadlock trap)
        setTimeout(() => loadIdentity(s.user!.id), 0);
      } else {
        setStaffRole(null);
        setCustomerId(null);
        setDisplayName(null);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) {
        loadIdentity(data.session.user.id);
      }
      setLoading(false);
    });
  }, [loadIdentity]);

  return (
    <AuthContext.Provider
      value={{ user, session, loading, staffRole, customerId, displayName }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

export const signOut = () => supabase.auth.signOut();
