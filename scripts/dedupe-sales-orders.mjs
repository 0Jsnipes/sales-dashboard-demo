#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function normalizePrivateKey(value) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  const unquoted = (trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ? trimmed.slice(1, -1)
    : trimmed;
  return unquoted.replace(/\\n/g, "\n");
}

function normalizeDatabaseId(value) {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === "default") return "(default)";
  return trimmed;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) continue;
    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1);
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (typeof process.env[key] === "undefined") process.env[key] = value;
  }
}

function ensureAdminApp() {
  if (getApps().length) return getApps()[0];
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY);
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Missing Firebase Admin credentials. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY.");
  }
  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  });
}

function canonicalKey(order) {
  return `${String(order.orderId || order.orderUid || "").trim()}::${String(order.orderDateId || "").trim()}`;
}

function chooseKeeper(group) {
  return [...group].sort((left, right) => {
    const leftLocked = Boolean(left.data.lockedAssignment) ? 1 : 0;
    const rightLocked = Boolean(right.data.lockedAssignment) ? 1 : 0;
    if (leftLocked !== rightLocked) return rightLocked - leftLocked;

    const leftMatched = left.data.matchStatus === "matched" || left.data.matchStatus === "manual" ? 1 : 0;
    const rightMatched = right.data.matchStatus === "matched" || right.data.matchStatus === "manual" ? 1 : 0;
    if (leftMatched !== rightMatched) return rightMatched - leftMatched;

    const leftUpdated = left.data.updatedAt?.toMillis?.() ?? left.data.createdAt?.toMillis?.() ?? 0;
    const rightUpdated = right.data.updatedAt?.toMillis?.() ?? right.data.createdAt?.toMillis?.() ?? 0;
    if (leftUpdated !== rightUpdated) return rightUpdated - leftUpdated;

    const leftRawSize = JSON.stringify(left.data.rawData || {}).length;
    const rightRawSize = JSON.stringify(right.data.rawData || {}).length;
    return rightRawSize - leftRawSize;
  })[0];
}

async function main() {
  const apply = process.argv.includes("--apply");
  const providers = process.argv
    .filter((value) => value.startsWith("--provider="))
    .map((value) => value.split("=", 2)[1])
    .filter(Boolean);
  const targetProviders = providers.length ? providers : ["att", "tfiber", "manual"];

  loadEnvFile(path.join(__dirname, "..", ".env.local"));
  const app = ensureAdminApp();
  const db = getFirestore(app, normalizeDatabaseId(process.env.FIREBASE_DATABASE_ID));

  const summary = [];
  let totalDuplicates = 0;
  let totalDeleted = 0;

  for (const provider of targetProviders) {
    const snapshot = await db.collection("salesOrders").doc(provider).collection("orders").get();
    const groups = new Map();
    for (const document of snapshot.docs) {
      const data = document.data();
      const key = canonicalKey(data);
      const list = groups.get(key) || [];
      list.push({ ref: document.ref, data });
      groups.set(key, list);
    }

    const duplicates = [...groups.entries()].filter(([, group]) => group.length > 1);
    const duplicateCount = duplicates.reduce((sum, [, group]) => sum + (group.length - 1), 0);
    totalDuplicates += duplicateCount;

    if (!apply) {
      summary.push({ provider, duplicateGroups: duplicates.length, duplicateDocs: duplicateCount });
      continue;
    }

    for (const [, group] of duplicates) {
      const keeper = chooseKeeper(group);
      const deletions = group.filter((item) => item.ref.path !== keeper.ref.path);
      for (let index = 0; index < deletions.length; index += 400) {
        const batch = db.batch();
        for (const item of deletions.slice(index, index + 400)) {
          batch.delete(item.ref);
          totalDeleted += 1;
        }
        await batch.commit();
      }
    }

    summary.push({ provider, duplicateGroups: duplicates.length, duplicateDocs: duplicateCount, deleted: duplicateCount });
  }

  if (!apply) {
    console.log(JSON.stringify({ mode: "dry-run", totalDuplicateDocs: totalDuplicates, summary }, null, 2));
    console.log("Run again with --apply to delete the duplicate docs.");
    return;
  }

  console.log(JSON.stringify({ mode: "apply", totalDeleted, summary }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
