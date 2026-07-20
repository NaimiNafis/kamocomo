import { create } from 'zustand';
import {
  ensureIdentity,
  hasCompletedOnboarding,
  saveOnboardingProfile,
  type OnboardingFields,
  type Profile,
} from '../lib/identity';

interface IdentityState {
  status: 'loading' | 'ready' | 'error';
  userId: string | null;
  profile: Profile | null;
  error: string | null;
  init: () => Promise<void>;
  completeOnboarding: (fields: OnboardingFields) => Promise<void>;
}

// Memoized in-flight init call: React StrictMode (and any other caller that
// fires init() twice back-to-back) would otherwise race two concurrent
// ensureIdentity() calls, each creating its own anonymous user before either
// sees the other's session.
let initPromise: Promise<void> | null = null;

/** §6 identity + §5.2 onboarding state, shared across every screen. */
export const useIdentityStore = create<IdentityState>((set, get) => ({
  status: 'loading',
  userId: null,
  profile: null,
  error: null,
  init: () => {
    initPromise ??= (async () => {
      try {
        const { userId, profile } = await ensureIdentity();
        set({ status: 'ready', userId, profile });
      } catch (err) {
        set({ status: 'error', error: err instanceof Error ? err.message : String(err) });
      }
    })();
    return initPromise;
  },
  completeOnboarding: async (fields) => {
    const { userId } = get();
    if (!userId) return;
    const profile = await saveOnboardingProfile(userId, fields);
    set({ profile });
  },
}));

export function needsOnboarding(profile: Profile | null): boolean {
  return !hasCompletedOnboarding(profile);
}
