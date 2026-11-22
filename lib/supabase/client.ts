"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { clientEnv } from "@/lib/env";

let browserClient: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (!clientEnv.supabaseUrl || !clientEnv.supabaseAnonKey) {
    return null;
  }

  if (!browserClient) {
    browserClient = createClient(
      clientEnv.supabaseUrl,
      clientEnv.supabaseAnonKey,
      {
        realtime: {
          params: {
            eventsPerSecond: 20,
          },
        },
      }
    );
  }

  return browserClient;
}
