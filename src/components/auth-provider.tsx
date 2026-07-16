"use client";

import { onIdTokenChanged, type User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getFirebaseAuth, getFirebaseDb } from "@/src/lib/firebase/client";
import type { AppUser } from "@/src/types/user";
import { normalizeBusinessUnit, normalizePermissions } from "@/src/lib/access";
import { setViewAsAuthUid } from "@/src/lib/auth/view-as-client";

type BaseAuthState = { user: User | null; profile: AppUser | null; loading: boolean; error: string | null };
type AuthState = BaseAuthState & {
  actualProfile: AppUser | null;
  viewAsProfile: AppUser | null;
  isViewingAs: boolean;
  refreshProfile: () => Promise<void>;
  startViewingAs: (profile: AppUser) => void;
  stopViewingAs: () => void;
};
const AuthContext = createContext<AuthState>({ user: null, profile: null, actualProfile: null, viewAsProfile: null, isViewingAs: false, loading: true, error: null, refreshProfile: async () => undefined, startViewingAs: () => undefined, stopViewingAs: () => undefined });

function normalizeProfile(data: AppUser): AppUser {
  return {
    ...data,
    role: data.demoSeedId && data.demoPresentationRole === "superAdmin" ? "superAdmin" : data.role,
    businessUnit: normalizeBusinessUnit(data.businessUnit),
    mustChangePassword: Boolean(data.mustChangePassword),
    locationIds: Array.isArray(data.locationIds) ? data.locationIds : [],
    permissions: normalizePermissions(data.permissions),
  };
}

async function loadProfile(user: User) {
  const snapshot = await getDoc(doc(getFirebaseDb(), "users", user.uid));
  if (!snapshot.exists()) throw new Error("This account does not have an AB Sales Operations profile.");
  return normalizeProfile(snapshot.data() as AppUser);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<BaseAuthState>({ user: null, profile: null, loading: true, error: null });
  const [viewAsProfile, setViewAsProfile] = useState<AppUser | null>(null);
  const stopViewingAs = useCallback(() => {
    setViewAsAuthUid(null);
    setViewAsProfile(null);
  }, []);
  const startViewingAs = useCallback((profile: AppUser) => {
    if (state.profile?.role !== "superAdmin" || state.profile.demoSeedId) return;
    const normalized = normalizeProfile(profile);
    setViewAsAuthUid(normalized.authUid);
    setViewAsProfile(normalized);
  }, [state.profile]);
  const refreshProfile = useCallback(async () => {
    const user = getFirebaseAuth().currentUser;
    if (!user) {
      setState({ user: null, profile: null, loading: false, error: null });
      return;
    }
    const profile = await loadProfile(user);
    setState({ user, profile, loading: false, error: null });
    if (profile.role !== "superAdmin") stopViewingAs();
  }, [stopViewingAs]);

  useEffect(() => {
    let active = true;
    const unsubscribe = onIdTokenChanged(getFirebaseAuth(), async (user) => {
      stopViewingAs();
      if (!user) { if (active) setState({ user: null, profile: null, loading: false, error: null }); return; }
      try {
        const profile = await loadProfile(user);
        if (active) setState({ user, profile, loading: false, error: null });
      } catch (error) {
        if (active) setState({ user, profile: null, loading: false, error: error instanceof Error ? error.message : "Unable to load your access profile." });
      }
    });
    return () => { active = false; unsubscribe(); };
  }, [stopViewingAs]);
  const value = useMemo(() => ({ ...state, actualProfile: state.profile, profile: viewAsProfile ?? state.profile, viewAsProfile, isViewingAs: Boolean(viewAsProfile), refreshProfile, startViewingAs, stopViewingAs }), [refreshProfile, startViewingAs, state, stopViewingAs, viewAsProfile]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);
