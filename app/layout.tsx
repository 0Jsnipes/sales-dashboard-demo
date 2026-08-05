import type { Metadata } from "next";
import "./globals.css";
import { AppProviders } from "@/src/components/app-providers";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Snipes Systems",
  description: "Snipes Systems' sales operations application for roster management, report imports, sales and knock reporting, teams, and onboarding. Portfolio demo — all data is synthetic.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={cn("h-full antialiased", geist.variable)}>
      <body className="min-h-full bg-background text-foreground">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
