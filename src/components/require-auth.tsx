"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LoaderCircle, ShieldAlert } from "lucide-react";
import { useAuth } from "./auth-provider";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, error } = useAuth();
  const router = useRouter(); const pathname = usePathname();
  useEffect(() => { if (!loading && (!user || !profile)) router.replace(`/sign-in?next=${encodeURIComponent(pathname)}`); }, [loading, user, profile, router, pathname]);
  if (loading) return <div className="auth-loading"><LoaderCircle className="spin" size={25}/><span>Loading secure workspace…</span></div>;
  if (!user || !profile) return <div className="auth-loading"><ShieldAlert size={25}/><span>{error ?? "Redirecting to sign in…"}</span></div>;
  return <>{children}</>;
}
