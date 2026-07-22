import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { microLabel } from "@/components/ui/stat-tile";

export function Panel({
  title,
  description,
  meta,
  accentColor,
  className,
  bodyClassName,
  children,
}: {
  title: string;
  description?: string;
  meta?: string;
  accentColor?: string;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("flex flex-col overflow-hidden rounded-1xl border border-border bg-card shadow-sm", className)}>
      {accentColor ? <div className="h-[3px] w-full" style={{ background: accentColor }} aria-hidden /> : null}
      <header className="flex items-start justify-between gap-4 border-b border-border px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold tracking-tight">{title}</h3>
          {description ? <p className="mt-1 text-[13px] text-muted-foreground">{description}</p> : null}
        </div>
        {meta ? <p className={cn("shrink-0 pt-1 text-right", microLabel)}>{meta}</p> : null}
      </header>
      <div className={cn("flex-1 p-4 sm:p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

export function FlatEmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-6 text-center">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
