"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, LockKeyhole, Sparkles } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DEMO_BRAND_NAME, DEMO_EMAIL, DEMO_PASSWORD } from "@/src/lib/demo/config";
import { signIn as signInDemo } from "@/src/lib/demo/session";
import { DataRainBackground } from "@/components/ui/data-rain-background";

export function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const reducedMotion = useReducedMotion();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    if (email.trim().toLowerCase() !== DEMO_EMAIL.toLowerCase() || password !== DEMO_PASSWORD) {
      setError(`Use the demo credentials: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
      setPending(false);
      return;
    }
    signInDemo();
    router.replace(params.get("next") || "/dashboard");
  }

  function fillDemoCredentials() {
    setEmail(DEMO_EMAIL);
    setPassword(DEMO_PASSWORD);
    setError("");
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-background">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,.16),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(14,165,233,.12),transparent_28%)]" />
      <DataRainBackground className="-z-10" />
      <div className="mx-auto grid min-h-screen w-full max-w-[1440px] lg:grid-cols-[1.02fr_.98fr]">
        <section className="flex items-center justify-center px-6 py-10 sm:px-10 lg:px-12">
          <motion.div initial={reducedMotion ? false : { opacity: 0, y: 16 }} animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }} className="w-full max-w-md">
            <Link href="/" className="mb-6 inline-flex items-center gap-3 text-sm font-semibold tracking-wide">
              <Image src="/legacy-assets/SS_Logo.png" alt={DEMO_BRAND_NAME} width={40} height={40} className="rounded-xl" />
              {DEMO_BRAND_NAME}
            </Link>
            <Card className="border-border/70">
              <CardHeader className="space-y-4 border-b border-border/60 bg-card/60">
                <div className="inline-flex w-fit rounded-full bg-primary/10 p-3 text-primary">
                  <LockKeyhole className="h-5 w-5" />
                </div>
                <div className="space-y-2">
                  <CardTitle className="text-2xl">Welcome back</CardTitle>
                  <CardDescription>Sign in to access the {DEMO_BRAND_NAME} sales operations workspace.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 p-6">
                <form className="space-y-4" onSubmit={submit}>
                  <div className="space-y-2">
                    <label htmlFor="email" className="text-sm font-medium">
                      Email address
                    </label>
                    <Input
                      id="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      type="email"
                      autoComplete="email"
                      placeholder="you@company.com"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="password" className="text-sm font-medium">
                      Password
                    </label>
                    <Input
                      id="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      type="password"
                      autoComplete="current-password"
                      placeholder="Enter your password"
                      required
                    />
                  </div>
                  <div className="flex items-center justify-end">
                    <Button type="submit" disabled={pending} className="sm:min-w-32">
                      {pending ? "Signing in..." : "Sign in"}
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </form>
                {error && (
                  <Alert variant="destructive">
                    <AlertTitle>Sign-in failed</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                <Alert className="border-primary/30 bg-primary/5">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <AlertTitle>Portfolio demo</AlertTitle>
                  <AlertDescription className="space-y-2">
                    <div className="text-sm">
                      <div>
                        Email: <span className="font-mono">{DEMO_EMAIL}</span>
                      </div>
                      <div>
                        Password: <span className="font-mono">{DEMO_PASSWORD}</span>
                      </div>
                    </div>
                    <Button type="button" size="sm" variant="secondary" onClick={fillDemoCredentials}>
                      Fill demo credentials
                    </Button>
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          </motion.div>
        </section>
        <aside className="relative hidden overflow-hidden border-l border-border/70 p-10 text-foreground lg:flex lg:flex-col lg:justify-between">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,.18),transparent_35%),linear-gradient(180deg,color-mix(in_oklab,var(--background)_88%,white),var(--background))]" />
          <div className="absolute inset-0 -z-10 bg-[linear-gradient(rgba(255,255,255,.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.06)_1px,transparent_1px)] bg-[size:40px_40px] opacity-30" />
          <div className="relative z-10">
            <p className="text-sm uppercase tracking-[0.3em] text-muted-foreground">{DEMO_BRAND_NAME} Sales Operations</p>
            <h2 className="mt-4 max-w-xl text-5xl font-semibold tracking-tight">Clear data. Confident decisions.</h2>
            <p className="mt-4 max-w-lg text-base text-muted-foreground">One secure workspace for roster management, imports, reporting, onboarding, and field performance.</p>
          </div>
          <div className="relative z-10 grid gap-4">
            {[
              ["Live overview", "Weekly sales, knocks, and alerts in one command center."],
              ["Import guardrails", "Every upload is validated before it reaches reporting."],
              ["Role-based access", "Permissions are enforced server-side and reflected in the UI."],
            ].map(([title, description]) => (
              <div key={title} className="rounded-2xl border border-border/70 bg-card/70 p-4">
                <p className="font-medium">{title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{description}</p>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </main>
  );
}
