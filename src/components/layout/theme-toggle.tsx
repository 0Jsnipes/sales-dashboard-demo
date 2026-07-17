"use client";

import { MoonStar, SunMedium } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const isDark = (theme === "system" ? resolvedTheme : theme) === "dark";

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label="Toggle color theme"
      title="Toggle color theme"
    >
      {isDark ? <SunMedium /> : <MoonStar />}
    </Button>
  );
}

export function ThemeToggleRow({
  className,
  labelHidden = false,
  iconClassName = "h-4 w-4 shrink-0",
}: {
  className?: string;
  labelHidden?: boolean;
  iconClassName?: string;
}) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const isDark = (theme === "system" ? resolvedTheme : theme) === "dark";

  return (
    <button type="button" className={className} onClick={() => setTheme(isDark ? "light" : "dark")} aria-label="Toggle color theme">
      {isDark ? <SunMedium className={iconClassName} /> : <MoonStar className={iconClassName} />}
      <span className={labelHidden ? "sr-only" : "truncate"}>{isDark ? "Light mode" : "Dark mode"}</span>
    </button>
  );
}
