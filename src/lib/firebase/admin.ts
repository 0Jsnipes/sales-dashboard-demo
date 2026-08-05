import "server-only";

import type { App } from "firebase-admin/app";
import type { Auth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";
import type { Storage } from "firebase-admin/storage";
import { getDemoAuth, getDemoFirestore } from "@/src/lib/demo/runtime";

/**
 * This deployment is a self-contained portfolio demo: there is no real
 * Firebase project behind it. These exports keep the same signatures every
 * `app/api/**` route already calls, but are backed by the in-memory demo
 * store in `src/lib/demo/` instead of a live Firestore/Auth connection.
 *
 * File storage isn't mocked — nothing in the demo's golden path (roster,
 * imports, teams, reporting) requires it once the two sales-upload routes
 * skip their storage write (see app/api/imports/att and .../tfiber). A few
 * peripheral features that were already effectively dead in this build
 * (inbound email import, the knock CSV pipeline, the backfill ops page)
 * still reference `getAdminApp()` purely so they continue to compile; they
 * are not part of the demo experience and will throw if actually invoked.
 */
export const getAdminDb = (): Firestore => getDemoFirestore() as unknown as Firestore;
export const getAdminAuth = (): Auth => getDemoAuth() as unknown as Auth;
export const getAdminApp = (): App => {
  throw new Error("No live Firebase project is configured — this deployment is a self-contained demo.");
};
export const getAdminStorage = (): Storage => {
  throw new Error("Storage is not available in demo mode.");
};
