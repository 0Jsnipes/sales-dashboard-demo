# Sales Dashboard Demo

A sanitized public demo of a production sales operations platform built to centralize reporting, representative performance, market activity, onboarding workflows, and sales data imports across multiple telecom programs.

The production version of this system is used for real business operations and contains confidential company data and integrations. This repository provides a safe demo environment using mock or sanitized data so the architecture and user experience can be reviewed publicly.

## Overview

The Sales Dashboard was built to replace fragmented spreadsheets and manual reporting workflows with a centralized application for sales operations.

The platform supports:

* Sales performance tracking
* Representative and manager reporting
* Market and territory management
* Weekly, monthly, and year-to-date metrics
* Spreadsheet and CSV imports
* Duplicate detection and data validation
* Install and cancellation tracking
* Email-based report ingestion
* Role-based access
* Demo-mode data isolation
* Operational dashboards and reporting views

## Tech Stack

* **Next.js**
* **React**
* **TypeScript**
* **Firebase**
* **Firestore**
* **Firebase Admin SDK**
* **Node.js**
* **Mailgun**
* **CSV / Excel data processing**
* **Vercel**

## Why I Built It

Sales reporting was spread across multiple providers, spreadsheets, and operational workflows.

Each provider exports data differently, which creates several problems:

* Different column formats
* Different naming conventions
* Duplicate records
* Inconsistent sales statuses
* Manual weekly calculations
* Separate knock and sales reports
* Difficult rep and manager comparisons
* Limited visibility into pending installs and cancellations

The Sales Dashboard consolidates those workflows into a single application and normalizes provider data into a common reporting model.

## Reporting Features

The dashboard supports multiple reporting periods, including:

* Current week
* Previous week
* Month-to-date
* Previous month comparison
* Year-to-date
* Custom date ranges

Performance can be viewed across:

* Representatives
* Managers
* Teams
* Markets
* Providers
* Sales programs

The application also calculates comparative progress using matching periods instead of simply comparing complete calendar ranges.

For example:

* Current week-to-date vs. the equivalent days of the previous week
* Month-to-date vs. the equivalent period of the previous month
* Year-to-date vs. the equivalent dates of the previous year

## Sales and Activity Imports

The system supports multiple report formats from different providers.

Current import workflows include:

* AT&T sales reports
* T-Fiber sales reports
* AT&T activity / knock reports
* T-Fiber activity / knock reports

Examples of accepted source files include:

```text
Sales_order.csv
AB Marketing Orders.xlsx
Book1.xlsx
report.xlsx
reports.xlsx
```

Each import pipeline performs normalization before records reach the dashboard.

Depending on the source, the application can process:

* Representative names
* Sale dates
* Provider
* Order status
* Activation status
* Install dates
* Cancellation information
* Knock / activity totals
* Market information

## Duplicate Detection

Imported records are checked before being added to the reporting dataset.

This prevents the same sale or activity data from being counted multiple times when reports are uploaded repeatedly.

The import workflow separates:

1. File parsing
2. Data normalization
3. Validation
4. Duplicate detection
5. Persistence
6. Reporting calculations

This makes provider-specific parsing logic easier to maintain while keeping the reporting layer provider-independent.

## Install Tracking

Sales are grouped into operational states such as:

* Installed
* Pending
* Past Due
* Cancelled

Installed orders may be identified through:

* Activation dates
* Completed statuses
* Active statuses
* Installed statuses

Pending orders include orders that have not yet reached an installed or cancelled state.

Past Due is treated as a subset of pending orders where the expected install or tracking date has passed.

This allows operational users to identify sales that require follow-up instead of only viewing total sales volume.

## Cancellation Tracking

Cancellation reporting is handled at the order level.

An imported order can be marked cancelled when provider data includes either:

* A cancellation status
* A cancellation date

This allows cancellation rates to be compared against provider, market, team, manager, and representative performance.

## Email-Based Report Imports

The application also supports automated report ingestion through email.

Inbound report attachments are processed through:

```text
POST /api/imports/email
```

Mailgun can forward incoming reports to this endpoint.

The workflow supports:

* Signed Mailgun webhook requests
* Approved sender restrictions
* Token-based fallback authentication
* Attachment validation
* Provider-specific file recognition
* Automated report processing

This removes the need for an administrator to manually download and re-upload every recurring provider report.

## Demo Mode

This repository includes a dedicated demo mode so recruiters, clients, and reviewers can explore the application without accessing production information.

Demo mode is:

* Read-only
* Backed by mock or sanitized data
* Isolated from production records
* Safe for public review

The public demo exists specifically to demonstrate the system without exposing confidential operational data.

## Application Architecture

The project separates provider-specific ingestion logic from normalized application data.

A simplified data flow looks like:

```text
Provider Report
      ↓
File Parser
      ↓
Provider Normalizer
      ↓
Validation
      ↓
Duplicate Detection
      ↓
Firebase / Firestore
      ↓
Reporting Layer
      ↓
Dashboard UI
```

This architecture allows additional providers and report formats to be introduced without rebuilding the dashboard itself.

## Environment Variables

Copy the project's environment configuration into your local environment or configure the values through Vercel.

### Firebase Client

```env
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_DATABASE_ID=default
```

### Firebase Server

```env
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
FIREBASE_DATABASE_ID=default
FIREBASE_STORAGE_BUCKET=
```

### Email Imports

```env
NEXT_PUBLIC_REPORTS_INBOUND_EMAIL=
MAILGUN_WEBHOOK_SIGNING_KEY=
REPORTS_ALLOWED_SENDERS=
REPORTS_INBOUND_SECRET=
```

Server credentials must never be exposed through `NEXT_PUBLIC_*` variables.

## Running Locally

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Then open:

```text
http://localhost:3000
```

## Production vs. Demo

This repository is intentionally separate from the production deployment.

### Demo repository

Used for:

* Portfolio review
* Recruiter review
* UI demonstrations
* Architecture discussion
* Feature demonstrations

### Production system

Contains:

* Live operational data
* Internal company workflows
* Production integrations
* Confidential business information

The production source and data remain private.

## What This Project Demonstrates

This project represents more than a dashboard UI.

It demonstrates experience with:

* Full-stack application development
* Business-process automation
* Data normalization
* Spreadsheet and CSV ingestion
* Backend API design
* Authentication
* Firebase architecture
* Server-side credentials
* Email webhooks
* Data validation
* Duplicate prevention
* Operational reporting
* Production vs. demo environment separation

## Project Status

The production platform continues to evolve as operational requirements change.

The public demo is maintained as a sanitized representation of the core system and is intended to demonstrate the application's architecture, workflows, and user experience without exposing confidential company information.
