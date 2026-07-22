import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

type LegalSection = {
  title: string;
  content: React.ReactNode;
};

type LegalPageProps = {
  eyebrow: string;
  title: string;
  introduction: string;
  sections: LegalSection[];
};

export function LegalPage({ eyebrow, title, introduction, sections }: LegalPageProps) {
  const contactEmail = process.env.NEXT_PUBLIC_LEGAL_CONTACT_EMAIL?.trim();

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,.14),transparent_35%),radial-gradient(circle_at_right_20%_top_20%,rgba(14,165,233,.12),transparent_30%)]" />
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-5 sm:px-6 lg:px-8">
        <Link href="/" className="inline-flex items-center gap-3 text-sm font-semibold tracking-wide">
          <Image src="/legacy-assets/ab-logo.png" alt="AB Marketing" width={42} height={42} className="rounded-xl" priority />
          AB Marketing
        </Link>
        <Button asChild variant="outline">
          <Link href="/">
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Link>
        </Button>
      </header>

      <article className="mx-auto w-full max-w-5xl px-4 pb-20 pt-6 sm:px-6 lg:px-8 lg:pt-12">
        <div className="border border-border/70 bg-card/80 p-6 sm:p-10 lg:p-14">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">{title}</h1>
          <p className="mt-3 text-sm text-muted-foreground">Last updated: July 15, 2026</p>
          <p className="mt-8 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">{introduction}</p>

          <div className="mt-10 space-y-9">
            {sections.map((section) => (
              <section key={section.title} className="border-t border-border/70 pt-8">
                <h2 className="text-xl font-semibold tracking-tight">{section.title}</h2>
                <div className="mt-3 space-y-3 text-sm leading-7 text-muted-foreground sm:text-base">
                  {section.content}
                </div>
              </section>
            ))}

            <section className="border-t border-border/70 pt-8">
              <h2 className="text-xl font-semibold tracking-tight">Contact us</h2>
              <div className="mt-3 text-sm leading-7 text-muted-foreground sm:text-base">
                {contactEmail ? (
                  <p>
                    Questions, privacy requests, and account concerns may be sent to{" "}
                    <a className="font-medium text-primary underline-offset-4 hover:underline" href={`mailto:${contactEmail}`}>
                      {contactEmail}
                    </a>.
                  </p>
                ) : (
                  <p>Questions, privacy requests, and account concerns may be submitted to your AB Marketing administrator.</p>
                )}
              </div>
            </section>
          </div>

          <div className="mt-12 border-t border-border/70 pt-8">
            <Button asChild>
              <Link href="/">
                <ArrowLeft className="h-4 w-4" />
                Return to home page
              </Link>
            </Button>
          </div>
        </div>
      </article>
    </main>
  );
}
