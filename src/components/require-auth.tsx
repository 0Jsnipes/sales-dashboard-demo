"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, ShieldAlert } from "lucide-react";
import { useAuth } from "./auth-provider";
import { Card, CardContent } from "@/components/ui/card";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, error } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && (!user || !profile)) {
      router.replace(`/sign-in?next=${encodeURIComponent(pathname)}`);
    }
  }, [loading, user, profile, router, pathname]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <Card>
          <CardContent className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading secure workspace...
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!user || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <Card className="max-w-md">
          <CardContent className="flex items-start gap-3 p-6 text-sm text-muted-foreground">
            <ShieldAlert className="mt-0.5 h-5 w-5 text-danger" />
            <span>{error ?? "Redirecting to sign in..."}</span>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
