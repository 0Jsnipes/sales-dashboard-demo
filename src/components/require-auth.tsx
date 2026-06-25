"use client";

import { FormEvent, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { updatePassword, type User } from "firebase/auth";
import { Loader2, LockKeyhole, ShieldAlert } from "lucide-react";
import { useAuth } from "./auth-provider";
import { Card, CardContent } from "@/components/ui/card";
import { CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { authedFetch } from "@/src/lib/api/client";

function passwordError(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : "";
  if (code.includes("weak-password")) return "Choose a stronger password.";
  if (code.includes("requires-recent-login")) return "Sign out, sign back in with the temporary password, then set the new password.";
  return error instanceof Error ? error.message : "Unable to update password.";
}

function PasswordChangeGate({ user, onComplete }: { user: User; onComplete: () => Promise<void> }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setPending(true);
    try {
      await updatePassword(user, password);
      await user.getIdToken(true);
      const response = await authedFetch("/api/users/me", {
        method: "PATCH",
        body: JSON.stringify({ mustChangePassword: false }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(String(result.error || "Unable to save password status."));
      await onComplete();
    } catch (cause) {
      setError(passwordError(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <Card className="w-full max-w-md border-border/70 shadow-xl">
        <CardHeader className="space-y-3">
          <div className="inline-flex w-fit rounded-full bg-primary/10 p-3 text-primary">
            <LockKeyhole className="h-5 w-5" />
          </div>
          <div>
            <CardTitle>Create a new password</CardTitle>
            <CardDescription>Your account was created with a temporary password. Set a permanent password to continue.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-2">
              <label htmlFor="new-password" className="text-sm font-medium">New password</label>
              <Input id="new-password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            </div>
            <div className="space-y-2">
              <label htmlFor="confirm-password" className="text-sm font-medium">Confirm password</label>
              <Input id="confirm-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required />
            </div>
            {error ? (
              <Alert variant="destructive">
                <AlertTitle>Password not updated</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Saving..." : "Save password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, error, refreshProfile } = useAuth();
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

  if (profile.mustChangePassword) {
    return <PasswordChangeGate user={user} onComplete={refreshProfile} />;
  }

  return <>{children}</>;
}
