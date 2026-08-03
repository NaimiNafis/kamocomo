import { supabase } from './supabase';

export interface Profile {
  id: string;
  /** What this person would like to be called on their posts. Optional -- the
   * detail sheet falls back to the onboarding bands without it. */
  display_name: string | null;
  nationality: string | null;
  age_range: string | null;
  gender: string | null;
  created_at: string;
}

export type OnboardingFields = Pick<
  Profile,
  'display_name' | 'nationality' | 'age_range' | 'gender'
>;

const PROFILE_CACHE_KEY = 'kamo:profile';

export function getCachedProfile(): Profile | null {
  const raw = localStorage.getItem(PROFILE_CACHE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Profile;
  } catch {
    return null;
  }
}

function setCachedProfile(profile: Profile): void {
  localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile));
}

export function hasCompletedOnboarding(profile: Profile | null): boolean {
  return !!profile?.nationality && !!profile.age_range && !!profile.gender;
}

/** Creates the profile row on first sign-in, or returns the existing one untouched. */
async function ensureProfileRow(userId: string): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .upsert({ id: userId }, { onConflict: 'id' })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Establishes the anonymous identity (§6). Online: restores the persisted
 * session or signs in anonymously, then ensures a `profiles` row. Offline:
 * falls back to the cached profile so the app can still show cached content
 * read-only instead of getting stuck. supabase-js keeps the session in
 * localStorage itself and re-attaches it (and the real JWT) once back online,
 * so writes resume without a re-init.
 */
export async function ensureIdentity(): Promise<{ userId: string; profile: Profile }> {
  const cached = getCachedProfile();

  let sessionUserId: string | null = null;
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session) {
      sessionUserId = session.user.id;
    } else {
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error) throw error;
      sessionUserId = data.session?.user.id ?? null;
    }
  } catch {
    // offline / auth unreachable -- sessionUserId stays null
  }

  if (sessionUserId) {
    if (cached && cached.id === sessionUserId) {
      // Reconcile in the background without blocking the UI.
      void ensureProfileRow(sessionUserId).then(setCachedProfile).catch(() => {});
      return { userId: sessionUserId, profile: cached };
    }
    try {
      const profile = await ensureProfileRow(sessionUserId);
      setCachedProfile(profile);
      return { userId: sessionUserId, profile };
    } catch {
      if (cached && cached.id === sessionUserId) return { userId: sessionUserId, profile: cached };
      throw new Error('Failed to load profile.');
    }
  }

  // No session reachable (offline). Use the cached identity read-only.
  if (cached) return { userId: cached.id, profile: cached };
  throw new Error('Failed to establish an identity.');
}

export async function saveOnboardingProfile(
  userId: string,
  fields: OnboardingFields,
): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .update(fields)
    .eq('id', userId)
    .select()
    .single();

  if (error) throw error;
  setCachedProfile(data);
  return data;
}
