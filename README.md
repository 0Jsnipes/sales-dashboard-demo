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
REPORTS_INBOUND_SECRET
```

For `FIREBASE_PRIVATE_KEY`, paste the service-account private key either with real line breaks or with escaped `\n` characters. Do not expose the non-`NEXT_PUBLIC_` values in client-side code.

## Email imports

The app can accept emailed report attachments through `POST /api/imports/email`.

- Protect the endpoint with `REPORTS_INBOUND_SECRET`
- Configure your inbound email provider to post attachments to:
  `https://<your-domain>/api/imports/email?token=<REPORTS_INBOUND_SECRET>`
- Optional UI-only display address: `NEXT_PUBLIC_REPORTS_INBOUND_EMAIL`

If you are using Gmail API instead of an inbound-webhook provider, use:

- `POST /api/imports/email/gmail`
- `GMAIL_CLIENT_ID`
- `GMAIL_CLIENT_SECRET`
- `GMAIL_REFRESH_TOKEN`
- Optional `GMAIL_REPORTS_QUERY`
- Optional `GMAIL_PROCESSED_LABEL_ID`

Attachment conventions:

- ATT sales: `Sales_order` CSV
- T-Fiber sales: `AB Marketing Orders` workbook
- T-Fiber knocks: `Book1` workbook
- ATT knocks: `report` / `reports` workbook
