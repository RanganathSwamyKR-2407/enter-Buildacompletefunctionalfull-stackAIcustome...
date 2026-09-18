// Shared Enter Cloud client for backend functions (service role).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const DB_SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const DB_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!DB_SUPABASE_URL || !DB_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

export const db = createClient(DB_SUPABASE_URL ?? "", DB_SERVICE_ROLE_KEY ?? "", {
  auth: { persistSession: false, autoRefreshToken: false },
});
