import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { api } from "@/lib/api";
import type { Session, User } from "@supabase/supabase-js";

export interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  staffRole: string | null;
  customerId: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  refreshIdentity: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null,
  session: null,
  loading: true,
  staffRole: null,
  customerId: null,
  displayName: null,
  avatarUrl: null,
  refreshIdentity: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [staffRole, setStaffRole] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const loadIdentity = useCallback(async (uid: string) => {
    try {
      const { data: staff } = await supabase
        .from("resolveai_staff")
        .select("role, name, display_name, avatar_url")
        .eq("user_id", uid)
        .maybeSingle();
      if (staff) {
        const s = staff as { role: string; name: string; display_name: string | null; avatar_url: string | null };
        setStaffRole(s.role);
        setDisplayName(s.display_name ?? s.name);
        setAvatarUrl(s.avatar_url);
        return;
      }
      const { data: customer } = await supabase
        .from("resolveai_customers")
        .select("id, name, display_name, avatar_url")
        .eq("user_id", uid)
        .maybeSingle();
      if (customer) {
        const c = customer as { id: string; name: string; display_name: string | null; avatar_url: string | null };
        setCustomerId(c.id);
        setDisplayName(c.display_name ?? c.name);
        setAvatarUrl(c.avatar_url);
      }
    } catch {
      // identity lookup failure — leave unset
    }
  }, []);

  const refreshIdentity = useCallback(async () => {
    if (user?.id) await loadIdentity(user.id);
  }, [user?.id, loadIdentity]);

  useEffect(() => {
    supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        setStaffRole(null);
        setCustomerId(null);
        setDisplayName(null);
        setAvatarUrl(null);
        // Deferred call (deadlock trap)
        setTimeout(() => loadIdentity(s.user!.id), 0);
        // Associate a verified OAuth/email identity with any existing profile
        // by email (least privilege — never grants roles).
        setTimeout(() => void api.linkAccount().catch(() => {}), 400);
      } else {
        setStaffRole(null);
        setCustomerId(null);
        setDisplayName(null);
        setAvatarUrl(null);
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
      value={{ user, session, loading, staffRole, customerId, displayName, avatarUrl, refreshIdentity }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

export const signOut = () => supabase.auth.signOut();
