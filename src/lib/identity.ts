import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

export interface Profile {
  id: string;
  nationality: string | null;
  age_range: string | null;
  gender: string | null;
  created_at: string;
}

export type OnboardingFields = Pick<Profile, 'nationality' | 'age_range' | 'gender'>;

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
 * Ensures an anonymous Supabase session exists, restoring silently if one was
 * already persisted (§6 — supabase-js itself handles the localStorage
 * persistence/restore; this only creates a session when none exists yet) and
 * that a matching `profiles` row exists.
 */
export async function ensureIdentity(): Promise<{ session: Session; profile: Profile }> {
  const {
    data: { session: existingSession },
  } = await supabase.auth.getSession();

  let session = existingSession;
  if (!session) {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
    session = data.session;
  }
  if (!session) {
    throw new Error('Failed to establish an anonymous session.');
  }

  const cached = getCachedProfile();
  if (cached && cached.id === session.user.id) {
    // Reconcile with the server in the background without blocking the UI.
    void ensureProfileRow(session.user.id).then(setCachedProfile).catch(() => {});
    return { session, profile: cached };
  }

  const profile = await ensureProfileRow(session.user.id);
  setCachedProfile(profile);
  return { session, profile };
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
