"use client";

import { onIdTokenChanged, type User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getFirebaseAuth, getFirebaseDb } from "@/src/lib/firebase/client";
import type { AppUser } from "@/src/types/user";
import { normalizeBusinessUnit } from "@/src/lib/access";

type AuthState = { user: User | null; profile: AppUser | null; loading: boolean; error: string | null; refreshProfile: () => Promise<void> };
const AuthContext = createContext<AuthState>({ user: null, profile: null, loading: true, error: null, refreshProfile: async () => undefined });

function normalizeProfile(data: AppUser): AppUser {
  return {
    ...data,
    businessUnit: normalizeBusinessUnit(data.businessUnit),
    mustChangePassword: Boolean(data.mustChangePassword),
    locationIds: Array.isArray(data.locationIds) ? data.locationIds : [],
  };
}

async function loadProfile(user: User) {
  const snapshot = await getDoc(doc(getFirebaseDb(), "users", user.uid));
  if (!snapshot.exists()) throw new Error("This account does not have an AB Sales Operations profile.");
  return normalizeProfile(snapshot.data() as AppUser);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<Omit<AuthState, "refreshProfile">>({ user: null, profile: null, loading: true, error: null });
  const refreshProfile = useCallback(async () => {
    const user = getFirebaseAuth().currentUser;
    if (!user) {
      setState({ user: null, profile: null, loading: false, error: null });
      return;
    }
    const profile = await loadProfile(user);
    setState({ user, profile, loading: false, error: null });
  }, []);

  useEffect(() => {
    let active = true;
    const unsubscribe = onIdTokenChanged(getFirebaseAuth(), async (user) => {
      if (!user) { if (active) setState({ user: null, profile: null, loading: false, error: null }); return; }
      try {
        const profile = await loadProfile(user);
        if (active) setState({ user, profile, loading: false, error: null });
      } catch (error) {
        if (active) setState({ user, profile: null, loading: false, error: error instanceof Error ? error.message : "Unable to load your access profile." });
      }
    });
    return () => { active = false; unsubscribe(); };
  }, []);
  const value = useMemo(() => ({ ...state, refreshProfile }), [refreshProfile, state]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);
