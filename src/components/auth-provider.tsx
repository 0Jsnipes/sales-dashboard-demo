"use client";

import { onIdTokenChanged, type User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getFirebaseAuth, getFirebaseDb } from "@/src/lib/firebase/client";
import type { AppUser } from "@/src/types/user";

type AuthState = { user: User | null; profile: AppUser | null; loading: boolean; error: string | null };
const AuthContext = createContext<AuthState>({ user: null, profile: null, loading: true, error: null });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, profile: null, loading: true, error: null });
  useEffect(() => {
    let active = true;
    const unsubscribe = onIdTokenChanged(getFirebaseAuth(), async (user) => {
      if (!user) { if (active) setState({ user: null, profile: null, loading: false, error: null }); return; }
      try {
        const snapshot = await getDoc(doc(getFirebaseDb(), "users", user.uid));
        if (!snapshot.exists()) throw new Error("This account does not have an AB Sales Operations profile.");
        if (active) setState({ user, profile: snapshot.data() as AppUser, loading: false, error: null });
      } catch (error) {
        if (active) setState({ user, profile: null, loading: false, error: error instanceof Error ? error.message : "Unable to load your access profile." });
      }
    });
    return () => { active = false; unsubscribe(); };
  }, []);
  const value = useMemo(() => state, [state]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);
