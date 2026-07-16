import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/src/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy | AB Marketing",
  description: "Privacy Policy for the AB Marketing Sales Operations application.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Privacy Policy"
      introduction="AB Marketing respects your privacy. This policy explains what information the AB Marketing Sales Operations application collects, why we use it, and the choices available to you. We do not sell your personal information."
      sections={[
        {
          title: "Information we collect",
          content: (
            <>
              <p>We may collect account details such as your name, work email address, role, team, manager, location, and other information supplied by you or your organization.</p>
              <p>The application processes operational data that may include sales orders, customer identifiers contained in reports, representative activity, knocks, dispositions, timestamps, goals, uploaded files, and import history.</p>
            </>
          ),
        },
        {
          title: "How we use information",
          content: (
            <ul className="list-disc space-y-2 pl-5">
              <li>Operate, secure, maintain, and improve the application.</li>
              <li>Import, validate, match, report, and export authorized sales and field activity.</li>
              <li>Manage rosters, teams, locations, managers, onboarding, and access permissions.</li>
              <li>Detect errors, prevent misuse, support users, and maintain audit history.</li>
              <li>Comply with applicable legal and contractual requirements.</li>
            </ul>
          ),
        },
        {
          title: "How we share information",
          content: (
            <>
              <p>We do not sell or rent personal information. We do not share personal information with third parties for their advertising or marketing.</p>
              <p>Information may be shared with authorized AB Marketing personnel, your organization, and service providers that help host, secure, or operate the application, such as Firebase, Mailgun, and deployment providers. These providers receive information only as needed to perform services for us and are expected to protect it.</p>
              <p>We may disclose information when required by law, to protect rights or safety, or as part of a business transaction where appropriate safeguards apply.</p>
            </>
          ),
        },
        {
          title: "Storage, security, and retention",
          content: (
            <>
              <p>We use reasonable administrative, technical, and organizational safeguards designed to protect information. No system can guarantee absolute security.</p>
              <p>Information is retained only as long as reasonably needed for operations, reporting, audit, contractual, and legal purposes. Data may then be deleted or de-identified, subject to backup and legal-retention requirements.</p>
            </>
          ),
        },
        {
          title: "Your choices and controls",
          content: (
            <>
              <p>You may request access, correction, or deletion of your personal information, subject to applicable requirements and your organization&apos;s recordkeeping obligations.</p>
              <p>Contact us or your administrator to request deletion, stop future email report imports, or ask questions about how operational data is handled.</p>
            </>
          ),
        },
        {
          title: "Children's privacy and policy changes",
          content: (
            <>
              <p>The application is intended for authorized business users and is not directed to children under 13.</p>
              <p>We may update this policy as the application or applicable requirements change. The revised policy will be posted here with a new last-updated date. Please also review our <Link className="font-medium text-primary underline-offset-4 hover:underline" href="/terms">Terms of Service</Link>.</p>
            </>
          ),
        },
      ]}
    />
  );
}
