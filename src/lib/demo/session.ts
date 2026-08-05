"use client";

import { DEMO_SESSION_STORAGE_KEY, DEMO_STORAGE_EVENT, DEMO_UID } from "./config";

export type DemoSession = { uid: string };

function readSession(): DemoSession | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(DEMO_SESSION_STORAGE_KEY) === "1" ? { uid: DEMO_UID } : null;
}

export function getSession(): DemoSession | null {
  return readSession();
}

export function signIn() {
  window.localStorage.setItem(DEMO_SESSION_STORAGE_KEY, "1");
  window.dispatchEvent(new Event(DEMO_STORAGE_EVENT));
}

export function signOut() {
  window.localStorage.removeItem(DEMO_SESSION_STORAGE_KEY);
  window.dispatchEvent(new Event(DEMO_STORAGE_EVENT));
}

/**
 * Notifies immediately with the current session, then again on sign-in/out
 * from this tab (custom event) or other tabs (storage event) — mirroring how
 * `onIdTokenChanged` used to deliver an initial state plus subsequent changes
 * through a single callback.
 */
export function subscribe(callback: () => void) {
  const onStorage = (event: StorageEvent) => { if (event.key === null || event.key === DEMO_SESSION_STORAGE_KEY) callback(); };
  window.addEventListener(DEMO_STORAGE_EVENT, callback);
  window.addEventListener("storage", onStorage);
  callback();
  return () => {
    window.removeEventListener(DEMO_STORAGE_EVENT, callback);
    window.removeEventListener("storage", onStorage);
  };
}
