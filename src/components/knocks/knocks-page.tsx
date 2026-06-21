"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { FileUp, Target } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function KnocksPage() {
  const reducedMotion = useReducedMotion();
  return (
    <motion.div initial={reducedMotion ? false : { opacity: 0, y: 12 }} animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Knocks reporting coming soon</CardTitle>
          <CardDescription>There is no live knock data endpoint wired here yet, so this screen stays honest about that limitation.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-[1fr_.8fr]">
          <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-6">
            <Target className="h-6 w-6 text-muted-foreground" />
            <p className="mt-3 font-medium">Upload knock report CTA</p>
            <p className="mt-1 text-sm text-muted-foreground">When the knock import lands, this card becomes the intake point.</p>
          </div>
          <div className="rounded-2xl border border-border/70 p-6">
            <p className="font-medium">Expected file</p>
            <p className="mt-2 text-sm text-muted-foreground">CSV or spreadsheet with representative, date, and knock counts.</p>
            <Button asChild variant="outline" className="mt-4">
              <Link href="/imports">
                <FileUp className="h-4 w-4" />
                Open imports
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
