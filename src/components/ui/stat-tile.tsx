import Link from "next/link";
import type { ComponentType } from "react";

import { cn } from "@/lib/utils";

export const microLabel = "text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground";

export function StatTile({
  label,
  value,
  detail,
  icon: Icon,
  accentColor,
  delta,
  deltaPositive,
  progress,
  valueColor,
  href,
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: ComponentType<{ className?: string }>;
  accentColor: string;
  delta?: string;
  deltaPositive?: boolean;
  progress?: number;
  valueColor?: string;
  href?: string;
}) {
  const body = (
    <>
      <div className="h-[3px] w-full" style={{ background: accentColor }} aria-hidden />
      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <p className={cn("truncate", microLabel)}>{label}</p>
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
            style={{ background: `color-mix(in oklab, ${accentColor} 14%, transparent)`, color: accentColor }}
            aria-hidden
          >
            <Icon className="h-4 w-4" />
          </span>
        </div>
        <p className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl" style={valueColor ? { color: valueColor } : undefined}>
          {value}
          {delta ? (
            <span className={cn("ml-2 align-middle text-[13px] font-semibold", deltaPositive ? "text-success" : "text-destructive")}>{delta}</span>
          ) : null}
        </p>
        {typeof progress === "number" ? (
          <div className="mt-2.5 h-1.5 w-full rounded-full bg-muted">
            <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, progress))}%`, background: accentColor }} />
          </div>
        ) : null}
        <p className="mt-2 line-clamp-2 text-[13px] leading-snug text-muted-foreground">{detail}</p>
      </div>
    </>
  );
  const className = cn("flex h-full w-full flex-col bg-card text-left", href && "transition-colors hover:bg-muted/40");
  return href ? <Link href={href} className={className}>{body}</Link> : <div className={className}>{body}</div>;
}
