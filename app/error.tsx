"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-2xl items-center px-4 py-10">
      <Card className="w-full border-border/70">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-warning/15 p-3 text-warning">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>Something went wrong</CardTitle>
              <CardDescription>We could not load this part of the workspace.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">Try refreshing the page. If the issue persists, contact an administrator with the error details.</p>
          <Button onClick={reset}>
            <RefreshCcw className="h-4 w-4" />
            Try again
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
