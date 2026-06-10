import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const VIEW_AS_READ_ONLY_STORAGE_KEY = "preplane_view_as_read_only";

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. " +
    "Copy .env.example to .env and fill in your Supabase project values, " +
    "or set these as build environment variables in your deployment platform."
  );
}

const guardedFetch: typeof fetch = (input, init = {}) => {
  const headers = new Headers(init.headers);
  if (localStorage.getItem(VIEW_AS_READ_ONLY_STORAGE_KEY) === "true") {
    headers.set("x-preplane-view-as-read-only", "true");
  }
  return fetch(input, { ...init, headers });
};

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  global: { fetch: guardedFetch },
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
    // Supabase project uses implicit flow (access_token in URL hash).
    // PKCE is the newer default but only applies when the dashboard has it enabled.
    flowType: "implicit",
    detectSessionInUrl: true,
  }
});
