import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Get current session with automatic fallback for initial SDK storage hydration.
 * Avoids race conditions where getSession() returns null immediately on fresh page load.
 */
export async function getCurrentSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) return session;

  return new Promise<any>((resolve) => {
    let resolved = false;
    let subscriptionObj: any = null;

    const timeout = setTimeout(async () => {
      if (!resolved) {
        resolved = true;
        subscriptionObj?.unsubscribe();
        const { data: { session: fallbackSession } } = await supabase.auth.getSession();
        resolve(fallbackSession);
      }
    }, 500);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        subscription?.unsubscribe();
        resolve(session);
      }
    });
    subscriptionObj = subscription;
  });
}