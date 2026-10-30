/**
 * Server-side Supabase client. Used for exactly one thing: the Google OAuth
 * handshake (authorization URL + code exchange). Everything after that is our
 * own Prisma session, so this client is never consulted on a normal request.
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { readSupabaseConfig } from "./config.ts";

export async function createSupabaseServerClient() {
  const config = readSupabaseConfig();
  if (!config) {
    throw new Error(
      "Supabase is not configured: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are missing.",
    );
  }

  const store = await cookies();

  return createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (cookiesToSet) => {
        for (const { name, value, options } of cookiesToSet) {
          try {
            store.set(name, value, options);
          } catch {
            // Server Components render read-only cookie stores; the OAuth
            // kickoff and the callback route both run where writes are allowed.
          }
        }
      },
    },
  });
}
