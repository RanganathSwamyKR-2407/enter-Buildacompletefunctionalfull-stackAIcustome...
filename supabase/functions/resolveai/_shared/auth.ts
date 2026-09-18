// =====================================================================
// ResolveAI — auth helpers for backend functions
// (Deno only)
// =====================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { db } from "./db.ts";

export const AUTH_SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
export const AUTH_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

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
 * The user is authenticated by their own JWT (never trusted from input),
 * and their identity rows are read server-side with the service-role
 * client keyed to that verified user id. RLS stays on for all client
 * access; this is purely server-side authorization context.
 */
export async function resolveCaller(
  token: string | null,
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
      console.error("resolveCaller: getUser failed", JSON.stringify(error));
      return { userId: null, staffRole: null, customerId: null, actor: "unauthenticated" };
    }
    const userId = data.user.id;

    const [{ data: staff }, { data: customer }] = await Promise.all([
      db.from("resolveai_staff").select("role, name").eq("user_id", userId).maybeSingle(),
      db.from("resolveai_customers").select("id, name").eq("user_id", userId).maybeSingle(),
    ]);

    return {
      userId,
      staffRole: staff ? String((staff as { role: string }).role) : null,
      customerId: customer ? String((customer as { id: string }).id) : null,
      actor: staff
        ? String((staff as { name: string }).name)
        : customer
          ? String((customer as { name: string }).name)
          : "customer",
    };
  } catch (err) {
    console.error("resolveCaller failed", err);
    return { userId: null, staffRole: null, customerId: null, actor: "unknown" };
  }
}
