import { type FirebaseApp, getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};
const appName = "ab-sales-operations";

function resolveDatabaseId(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed || "default";
}

const databaseId = resolveDatabaseId(process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID);

export function getFirebaseApp(): FirebaseApp {
  if (!config.apiKey || !config.projectId || !config.appId) {
    throw new Error("Firebase web configuration is missing. Copy .env.example to .env.local and fill the NEXT_PUBLIC_FIREBASE_* values.");
  }
  return getApps().some((app) => app.name === appName)
    ? getApp(appName)
    : initializeApp(config, appName);
}
export const getFirebaseAuth = () => getAuth(getFirebaseApp());
export const getFirebaseDb = () => getFirestore(getFirebaseApp(), databaseId);
