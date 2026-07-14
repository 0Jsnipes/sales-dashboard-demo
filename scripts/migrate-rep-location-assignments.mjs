#!/usr/bin/env node

// Optional, idempotent hygiene migration for the repLocationAssignments
// collection. Not required for the weekStart/scope fix to work — the shared
// resolver (src/lib/reps/location-assignments.ts) already reads legacy
// documents (weekISO + mode: "single"|"forward") on the fly and normalizes
// them at request time. Run this only if you want the raw Firestore documents
// themselves to carry the canonical weekStart/scope fields too (e.g. for
// direct BigQuery export or manual inspection).
//
// This never changes a document's id and never deletes anything — it only
// merges the two new fields onto existing docs that don't have them yet, so
// it is safe to run repeatedly and safe to abort/re-run.
//
// Usage:
//   node scripts/migrate-rep-location-assignments.mjs            # dry run, prints a summary
//   node scripts/migrate-rep-location-assignments.mjs --apply    # writes the merged fields

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

function resolveDatabaseId(value) {
  const trimmed = value?.trim();
  return trimmed || "default";
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

// Mirrors isoWeekToMonday() in src/lib/reps/location-assignments.ts — kept as
// a plain, dependency-free copy here since this script runs outside the
// Next.js/tsconfig-paths build.
function isoWeekToMonday(weekISO) {
  const match = /^(\d{4})-W(\d{1,2})$/.exec(String(weekISO || "").trim());
  if (!match) return null;
  const year = Number(match[1]);
  const week = Number(match[2]);
  if (!Number.isInteger(year) || !Number.isInteger(week) || week < 1 || week > 53) return null;
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Weekday = jan4.getUTCDay() || 7;
  const week1Monday = new Date(Date.UTC(year, 0, 4 - jan4Weekday + 1));
  const target = new Date(week1Monday);
  target.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  const pad = (value) => String(value).padStart(2, "0");
  return `${target.getUTCFullYear()}-${pad(target.getUTCMonth() + 1)}-${pad(target.getUTCDate())}`;
}

function migratedFields(data) {
  const hasWeekStart = typeof data.weekStart === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data.weekStart);
  const hasScope = data.scope === "week_only" || data.scope === "forward";
  if (hasWeekStart && hasScope) return null;

  const weekStart = hasWeekStart ? data.weekStart : isoWeekToMonday(data.weekISO);
  const scope = hasScope ? data.scope : data.mode === "single" ? "week_only" : data.mode === "forward" ? "forward" : null;
  if (!weekStart || !scope) return null;
  return { weekStart, scope };
}

async function main() {
  const apply = process.argv.includes("--apply");

  loadEnvFile(path.join(__dirname, "..", ".env.local"));
  const app = ensureAdminApp();
  const db = getFirestore(app, resolveDatabaseId(process.env.FIREBASE_DATABASE_ID));

  const snapshot = await db.collection("repLocationAssignments").get();
  let alreadyCanonical = 0;
  let migratable = 0;
  let unmigratable = 0;
  const unmigratableIds = [];
  const updates = [];

  for (const document of snapshot.docs) {
    const data = document.data();
    const fields = migratedFields(data);
    if (fields === null) {
      if (typeof data.weekStart === "string" && (data.scope === "week_only" || data.scope === "forward")) {
        alreadyCanonical += 1;
      } else {
        unmigratable += 1;
        unmigratableIds.push(document.id);
      }
      continue;
    }
    migratable += 1;
    updates.push({ ref: document.ref, fields });
  }

  if (!apply) {
    console.log(JSON.stringify({
      mode: "dry-run",
      totalDocs: snapshot.size,
      alreadyCanonical,
      migratable,
      unmigratable,
      unmigratableIds: unmigratableIds.slice(0, 20),
    }, null, 2));
    console.log("Run again with --apply to merge weekStart/scope onto the migratable docs.");
    return;
  }

  let written = 0;
  for (let index = 0; index < updates.length; index += 400) {
    const batch = db.batch();
    for (const { ref, fields } of updates.slice(index, index + 400)) {
      batch.set(ref, fields, { merge: true });
      written += 1;
    }
    await batch.commit();
  }

  console.log(JSON.stringify({ mode: "apply", totalDocs: snapshot.size, alreadyCanonical, written, unmigratable, unmigratableIds: unmigratableIds.slice(0, 20) }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
