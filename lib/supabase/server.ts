import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { clientEnv, serverEnv } from "@/lib/env";

export function getSupabaseServerClient(): SupabaseClient | null {
  const url = clientEnv.supabaseUrl;
  const key = serverEnv.supabaseServiceRoleKey || clientEnv.supabaseAnonKey;

  if (!url || !key) {
    return null;
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
