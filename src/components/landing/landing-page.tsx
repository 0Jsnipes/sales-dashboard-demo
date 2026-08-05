"use client";

import Link from "next/link";
import Image from "next/image";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, BarChart3, CheckCircle2, FileUp, ShieldCheck, Target, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { DataRainBackground } from "@/components/ui/data-rain-background";

const features = [
  { icon: Users, title: "Roster", text: "Maintain a single source of truth for reps, managers, and locations." },
  { icon: FileUp, title: "Imports", text: "Validate ATT and T-Fiber uploads before they reach reporting." },
  { icon: BarChart3, title: "Reporting", text: "Track sales, knocks, goals, and performance from one command center." },
  { icon: Target, title: "Onboarding", text: "Keep first-week setup structured and auditable." },
];

export function LandingPage() {
  const reducedMotion = useReducedMotion();

  return (
    <main className="relative overflow-hidden">
      <div className="relative overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,.14),transparent_35%),radial-gradient(circle_at_right_20%_top_20%,rgba(14,165,233,.12),transparent_30%),linear-gradient(180deg,var(--background),color-mix(in_oklch,var(--background)_90%,white))]" />
      <div className="absolute inset-x-0 top-0 -z-10 h-96 bg-[linear-gradient(135deg,rgba(37,99,235,.08),transparent_55%)]" />
      <DataRainBackground className="-z-10 [mask-image:linear-gradient(180deg,black,transparent_85%)]" />
      <header className="mx-auto flex w-full max-w-[1440px] items-center justify-between px-4 py-5 sm:px-6 lg:px-8">
        <Link href="/" className="inline-flex items-center gap-3 text-sm font-semibold tracking-wide">
          <Image src="/legacy-assets/SS_Logo.png" alt="Snipes Systems" width={42} height={42} className="rounded-xl" />
          Snipes Systems
        </Link>
        <Button asChild variant="outline">
          <Link href="/sign-in">
            Sign in
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </header>

      <section className="mx-auto grid w-full max-w-[1440px] gap-10 px-4 pb-16 pt-6 sm:px-6 lg:grid-cols-[1.05fr_.95fr] lg:px-8 lg:pb-24 lg:pt-14">
        <motion.div initial={reducedMotion ? false : { opacity: 0, y: 20 }} animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }} className="max-w-2xl">
          <Badge variant="outline" className="mb-5 w-fit">Portfolio demo — sales operations application</Badge>
          <h1 className="text-5xl font-semibold tracking-tight sm:text-6xl">Snipes Systems</h1>
          <p className="mt-6 max-w-xl text-lg text-muted-foreground">
            Snipes Systems is a sales operations application for managing representatives, teams, managers, and locations; importing sales and knock reports; reviewing performance; and supporting onboarding workflows. This is a live demo — sign in with the demo credentials to explore, all data is synthetic.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button asChild size="lg">
              <Link href="/sign-in">
                Open workspace
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-success" />
              Secure team access
            </div>
          </div>
          <div className="mt-8 flex flex-wrap gap-3 text-sm text-muted-foreground">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/70 px-3 py-2">
              <CheckCircle2 className="h-4 w-4 text-success" />
              Live data
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/70 px-3 py-2">
              <CheckCircle2 className="h-4 w-4 text-success" />
              Role-based access
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/70 px-3 py-2">
              <CheckCircle2 className="h-4 w-4 text-success" />
              Audit-friendly workflows
            </div>
          </div>
        </motion.div>

        <motion.div initial={reducedMotion ? false : { opacity: 0, y: 20 }} animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="relative">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,rgba(37,99,235,.22),transparent_48%)] blur-2xl" />
          <Card className="relative overflow-hidden border-border/70">
            <CardHeader>
              <CardTitle>Command center preview</CardTitle>
              <CardDescription>Overview cards, validation status, and team alerts in a single glance.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-4 md:grid-cols-2">
                {[
                  ["Weekly sales", "47", "+12.4%"],
                  ["Total knocks", "684", "+8.7%"],
                  ["Active reps", "18", "2 added"],
                  ["Data freshness", "Fresh", "Both sources processed"],
                ].map(([label, value, detail]) => (
                  <div key={label} className="rounded-2xl border border-border/70 bg-muted/25 p-4">
                    <p className="text-sm text-muted-foreground">{label}</p>
                    <p className="mt-2 text-2xl font-semibold">{value}</p>
                    <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
                  </div>
                ))}
              </div>
              <Separator />
              <div className="grid gap-3">
                {[
                  "Review unmatched rows before they enter reporting.",
                  "Upload ATT and T-Fiber files from the import center.",
                  "Track onboarding and backfill work with audited actions.",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3 rounded-2xl border border-border/70 p-3">
                    <div className="rounded-full bg-primary/10 p-2 text-primary">
                      <CheckCircle2 className="h-4 w-4" />
                    </div>
                    <p className="text-sm text-muted-foreground">{item}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </section>
      </div>

      <section className="mx-auto w-full max-w-[1440px] px-4 pb-20 pt-8 sm:px-6 sm:pt-10 lg:px-8">
        <div className="mb-6 max-w-2xl rounded-lg border border-border/70 bg-background/85 p-4 shadow-sm shadow-black/20 backdrop-blur-md sm:p-5">
          <h2 className="text-2xl font-semibold tracking-tight">What Snipes Systems does</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">The application brings core sales operations into one secure workspace for authorized Snipes Systems personnel.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <motion.div key={feature.title} initial={reducedMotion ? false : { opacity: 0, y: 16 }} animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }} transition={{ delay: 0.12 + index * 0.04 }}>
                <Card className="h-full border-border/70">
                  <CardContent className="p-5">
                    <div className="inline-flex rounded-2xl bg-primary/10 p-3 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h2 className="mt-4 text-lg font-semibold">{feature.title}</h2>
                    <p className="mt-2 text-sm text-muted-foreground">{feature.text}</p>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </section>

      <footer className="border-t border-border/70 bg-card/30">
        <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-3 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>© 2026 Snipes Systems. Portfolio demo — all rights reserved.</p>
          <nav aria-label="Legal" className="flex items-center gap-5">
            <Link className="transition-colors hover:text-foreground" href="/privacy">Privacy Policy</Link>
            <Link className="transition-colors hover:text-foreground" href="/terms">Terms of Service</Link>
          </nav>
        </div>
      </footer>
    </main>
  );
}
