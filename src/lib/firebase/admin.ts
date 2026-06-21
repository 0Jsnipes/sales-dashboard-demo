import { type App, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

export function getAdminApp(): App {
  if (getApps().length) return getApps()[0]!;
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Firebase Admin credentials are missing. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY in .env.local.");
  }
  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }), storageBucket: process.env.FIREBASE_STORAGE_BUCKET });
}
const databaseId = process.env.FIREBASE_DATABASE_ID || "(default)";
export const getAdminDb = () => getFirestore(getAdminApp(), databaseId);
export const getAdminAuth = () => getAuth(getAdminApp());
