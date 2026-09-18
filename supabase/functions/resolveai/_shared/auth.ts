// =====================================================================
// ResolveAI — auth helpers for backend functions
// (Deno only)
// =====================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const AUTH_SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const AUTH_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

export interface CallerInfo {
  userId: string | null;
  staffRole: string | null;
  customerId: string | null;
  actor: string;
}

/** Extract the JWT from the request Authorization header. */
export function bearerToken(req: Request): string | null {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  return auth.slice(7);
}

/**
 * Resolve the calling user + their ResolveAI role/customer identity.
 * Uses the user's own JWT via the anon client (service role never exposed).
 */
export async function resolveCaller(
  token: string | null,
  staffTable = "resolveai_staff",
  customerTable = "resolveai_customers",
): Promise<CallerInfo> {
  if (!token) {
    return { userId: null, staffRole: null, customerId: null, actor: "anonymous" };
  }
  try {
    const anon = createClient(AUTH_SUPABASE_URL, AUTH_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await anon.auth.getUser(token);
    if (error || !data.user) {
      return { userId: null, staffRole: null, customerId: null, actor: "unauthenticated" };
    }
    const userId = data.user.id;

    const [{ data: staff }, { data: customer }] = await Promise.all([
      fetchJson(staffTable, userId),
      fetchJson(customerTable, userId),
    ]);

    const staffRow = staff && staff.length > 0 ? staff[0] as Record<string, unknown> : null;
    const customerRow = customer && customer.length > 0 ? customer[0] as Record<string, unknown> : null;

    return {
      userId,
      staffRole: staffRow ? String(staffRow.role) : null,
      customerId: customerRow ? String(customerRow.id) : null,
      actor: staffRow ? String(staffRow.name) : customerRow ? String(customerRow.name) : "customer",
    };
  } catch (err) {
    console.error("resolveCaller failed", err);
    return { userId: null, staffRole: null, customerId: null, actor: "unknown" };
  }
}

async function fetchJson(table: string, userId: string): Promise<unknown[] | null> {
  const res = await fetch(
    `${AUTH_SUPABASE_URL}/rest/v1/${table}?user_id=eq.${userId}&select=*`,
    {
      headers: {
        apikey: AUTH_ANON_KEY,
        Authorization: `Bearer ${AUTH_ANON_KEY}`,
        "Content-Type": "application/json",
      },
    },
  );
  if (!res.ok) return null;
  return res.json();
}
