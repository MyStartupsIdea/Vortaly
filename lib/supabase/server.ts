import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side client. Uses the secret key, so it bypasses row level security —
 * only ever import this from route handlers or server components.
 */
export function getSupabaseServer(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) return null;
  return createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
