import "server-only";

import { MockStore, createMockFirestore } from "./mock-firestore";
import { createMockAuth } from "./mock-auth";
import { buildDemoDataset, todayDateId } from "./dataset";

type Runtime = { dateId: string; store: MockStore; db: ReturnType<typeof createMockFirestore>; auth: ReturnType<typeof createMockAuth> };

let cached: Runtime | null = null;

function build(): Runtime {
  const dataset = buildDemoDataset();
  const store = new MockStore();
  for (const doc of dataset.docs) store.seedDoc(doc.path, doc.id, doc.data);
  const auth = createMockAuth();
  for (const user of dataset.authUsers) auth.seedUser(user);
  return { dateId: dataset.dateId, store, db: createMockFirestore(store), auth };
}

/** Rebuilds the in-memory demo backend if the cached copy was generated for a previous day, so "today" in the data never goes stale even on a long-lived warm server instance. */
function getRuntime(): Runtime {
  const currentDateId = todayDateId();
  if (!cached || cached.dateId !== currentDateId) cached = build();
  return cached;
}

export function getDemoFirestore() {
  return getRuntime().db;
}

export function getDemoAuth() {
  return getRuntime().auth;
}
