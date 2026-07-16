This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Vercel environment variables

Vercel does not deploy `.env.local`. Add these in the Vercel project settings under **Environment Variables**, then redeploy:

```txt
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID
NEXT_PUBLIC_FIREBASE_DATABASE_ID=default

FIREBASE_PROJECT_ID
FIREBASE_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY
FIREBASE_DATABASE_ID=default
FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_REPORTS_INBOUND_EMAIL
MAILGUN_WEBHOOK_SIGNING_KEY
REPORTS_ALLOWED_SENDERS
REPORTS_INBOUND_SECRET
```

For `FIREBASE_PRIVATE_KEY`, paste the service-account private key either with real line breaks or with escaped `\n` characters. Do not expose the non-`NEXT_PUBLIC_` values in client-side code.

## Email imports

The app accepts emailed report attachments through `POST /api/imports/email`. Mailgun is the recommended inbound provider.

- Set `MAILGUN_WEBHOOK_SIGNING_KEY` to the account HTTP webhook signing key. Signed requests are required when this value is configured.
- Create a Mailgun receiving route that forwards matching mail to:
  `https://<your-domain>/api/imports/email`
- Optionally restrict envelope senders with `REPORTS_ALLOWED_SENDERS`, using a comma-separated list.
- If using a provider without signed requests, set `REPORTS_INBOUND_SECRET` and post to:
  `https://<your-domain>/api/imports/email?token=<REPORTS_INBOUND_SECRET>`
- Set `NEXT_PUBLIC_REPORTS_INBOUND_EMAIL` to show the receiving address in the Imports page.

Attachment conventions:

- ATT sales: `Sales_order` CSV
- T-Fiber sales: `AB Marketing Orders` workbook
- T-Fiber knocks: `Book1` workbook
- ATT knocks: `report` / `reports` workbook
- recommit  
