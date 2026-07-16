import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/src/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Terms of Service | AB Marketing",
  description: "Terms of Service for the AB Marketing Sales Operations application.",
};

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Terms of Service"
      introduction="These Terms of Service govern access to and use of the AB Marketing Sales Operations application. By accessing the application, you agree to these terms and confirm that you are authorized to use it on behalf of yourself or your organization."
      sections={[
        {
          title: "Authorized use",
          content: (
            <>
              <p>The application is provided for legitimate AB Marketing business operations, including roster management, report imports, sales and knock reporting, team administration, onboarding, and related workflows.</p>
              <p>You must use the application only as permitted by your role, your organization&apos;s policies, these terms, and applicable law.</p>
            </>
          ),
        },
        {
          title: "Accounts and security",
          content: (
            <>
              <p>You are responsible for protecting your login credentials and for activity performed through your account. Do not share access with unauthorized individuals or attempt to bypass permissions.</p>
              <p>Notify your AB Marketing administrator promptly if you suspect unauthorized access, compromised credentials, or misuse.</p>
            </>
          ),
        },
        {
          title: "Your data and connected services",
          content: (
            <>
              <p>You represent that you have the right and authorization to upload, import, process, and share any information you provide to the application.</p>
              <p>If you send reports through a connected email-delivery service, you authorize the application to process the messages and attachments necessary to provide the import feature, as described in our <Link className="font-medium text-primary underline-offset-4 hover:underline" href="/privacy">Privacy Policy</Link>.</p>
            </>
          ),
        },
        {
          title: "Prohibited conduct",
          content: (
            <ul className="list-disc space-y-2 pl-5">
              <li>Accessing data or accounts without authorization.</li>
              <li>Uploading malicious code or attempting to disrupt or probe the application.</li>
              <li>Using the application for unlawful, deceptive, abusive, or fraudulent purposes.</li>
              <li>Copying, reselling, reverse engineering, or exploiting the application except as permitted by law.</li>
              <li>Submitting information that violates another person&apos;s rights or applicable privacy obligations.</li>
            </ul>
          ),
        },
        {
          title: "Availability and changes",
          content: (
            <p>We may update, suspend, restrict, or discontinue any part of the application. We work to keep the application accurate and available, but uninterrupted operation, error-free results, and permanent storage are not guaranteed.</p>
          ),
        },
        {
          title: "Disclaimer and limitation of liability",
          content: (
            <>
              <p>The application is provided on an &quot;as is&quot; and &quot;as available&quot; basis to the fullest extent permitted by law. Reports and calculations should be reviewed before they are used for payroll, compensation, customer commitments, or other material decisions.</p>
              <p>To the fullest extent permitted by law, AB Marketing will not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages, or for loss of data, profits, revenue, or business opportunities arising from use of the application.</p>
            </>
          ),
        },
        {
          title: "Suspension, termination, and general terms",
          content: (
            <>
              <p>Access may be suspended or terminated when employment or authorization ends, when these terms are violated, or when necessary to protect the application, its users, or AB Marketing.</p>
              <p>These terms constitute the agreement concerning use of the application unless a separate written agreement applies. If any provision is unenforceable, the remaining provisions remain in effect. We may update these terms by posting a revised version with a new last-updated date.</p>
            </>
          ),
        },
      ]}
    />
  );
}
