"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { AppUser } from "@/src/types/user";
import { buildDemoUserProfile } from "@/src/lib/demo/config";
import { getSession, subscribe } from "@/src/lib/demo/session";
import { setViewAsAuthUid } from "@/src/lib/auth/view-as-client";

export type DemoAuthUser = { uid: string; email: string };
type BaseAuthState = { user: DemoAuthUser | null; profile: AppUser | null; loading: boolean; error: string | null };
type AuthState = BaseAuthState & {
  actualProfile: AppUser | null;
  viewAsProfile: AppUser | null;
  isViewingAs: boolean;
  refreshProfile: () => Promise<void>;
  startViewingAs: (profile: AppUser) => void;
  stopViewingAs: () => void;
};
const AuthContext = createContext<AuthState>({ user: null, profile: null, actualProfile: null, viewAsProfile: null, isViewingAs: false, loading: true, error: null, refreshProfile: async () => undefined, startViewingAs: () => undefined, stopViewingAs: () => undefined });

function loadState(): BaseAuthState {
  const session = getSession();
  if (!session) return { user: null, profile: null, loading: false, error: null };
  const profile = buildDemoUserProfile();
  return { user: { uid: profile.authUid, email: profile.email }, profile, loading: false, error: null };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<BaseAuthState>(() => ({ user: null, profile: null, loading: true, error: null }));
  const [viewAsProfile, setViewAsProfile] = useState<AppUser | null>(null);
  const stopViewingAs = useCallback(() => {
    setViewAsAuthUid(null);
    setViewAsProfile(null);
  }, []);
  const startViewingAs = useCallback((profile: AppUser) => {
    if (state.profile?.role !== "superAdmin") return;
    setViewAsAuthUid(profile.authUid);
    setViewAsProfile(profile);
  }, [state.profile]);
  const refreshProfile = useCallback(async () => {
    setState(loadState());
  }, []);

  useEffect(() => {
    const unsubscribe = subscribe(() => {
      stopViewingAs();
      setState(loadState());
    });
    return unsubscribe;
  }, [stopViewingAs]);

  const value = useMemo(() => ({ ...state, actualProfile: state.profile, profile: viewAsProfile ?? state.profile, viewAsProfile, isViewingAs: Boolean(viewAsProfile), refreshProfile, startViewingAs, stopViewingAs }), [refreshProfile, startViewingAs, state, stopViewingAs, viewAsProfile]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);
