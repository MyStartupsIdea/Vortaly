import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

let cached: SupabaseClient | null = null;

/**
 * Browser client. Returns null when the project has no keys yet, so the UI can
 * fall back to demo data instead of throwing on first paint.
 */
export function getSupabaseBrowser(): SupabaseClient | null {
  if (!url || !anonKey) return null;
  cached ??= createClient(url, anonKey, {
    auth: { persistSession: false },
  });
  return cached;
}
