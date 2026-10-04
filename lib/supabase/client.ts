"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";

let client: SupabaseClient | null = null;

export function browserSupabase() {
  if (!isSupabaseConfigured()) throw new Error("Supabase is not configured.");
  if (!client) client = createBrowserClient(supabaseUrl(), supabaseAnonKey());
  return client;
}
