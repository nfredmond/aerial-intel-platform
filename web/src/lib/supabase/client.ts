"use client";

import { createBrowserClient } from "@supabase/ssr";

import { getSupabaseEnv } from "@/lib/supabase/env";
import type { Database } from "@/lib/supabase/types";

export function createClientSupabaseClient() {
  const { url, anonKey } = getSupabaseEnv();

  return createBrowserClient<Database>(url, anonKey);
}
