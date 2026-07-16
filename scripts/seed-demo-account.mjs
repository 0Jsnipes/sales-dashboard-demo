#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { randomBytes } from "crypto";
import { fileURLToPath } from "url";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SEED_ID = "ab-showcase-v1";
const TEAM_ID = "demo-showcase-team";
const MANAGER_REP_UID = "demo-manager-morgan";
const MANIFEST_ID = "showcase-account";

function argument(name) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? "";
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 0) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function adminApp() {
  if (getApps().length) return getApps()[0];
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.trim().replace(/^['"]|['"]$/g, "").replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) throw new Error("Missing Firebase Admin credentials in .env.local.");
  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }), storageBucket: process.env.FIREBASE_STORAGE_BUCKET });
}

function dateId(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function addDays(date, amount) {
  const value = new Date(date);
  value.setUTCDate(value.getUTCDate() + amount);
  return value;
}

function easternToday() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), 12));
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function dashboardOnlyPermissions() {
  return {
    canViewDashboard: true,
    canViewPerformance: false,
    canViewReporting: false,
    canViewSales: false,
    canViewKnocks: false,
    canViewRoster: false,
    canViewTeams: false,
    canViewOnboarding: false,
    canViewImports: false,
    canViewBackfill: false,
    canViewSettings: false,
    canEditSales: false,
    canEditKnocks: false,
    canEditRoster: false,
    canEditOnboarding: false,
    canCreateUsers: false,
    canRunBackfill: false,
    canReassignSales: false,
    canFilterZeroSalesOnly: false,
    canViewKnockHours: false,
    canManageTeams: false,
    canExportTeamReports: false,
    canEmailTeamReports: false,
    canManageTeamAutoEmails: false,
    canManageRosterOptions: false,
    canManageRepRoles: false,
    canManageResources: false,
    canImportEmailReports: false,
  };
}

const repSeeds = [
  { repUid: MANAGER_REP_UID, displayName: "Morgan Brooks", locationName: "Denver, Colorado", weeklySalesGoal: 8, weeklyKnocksGoal: 250, accessRole: "manager" },
  { repUid: "demo-rep-alex", displayName: "Alex Carter", locationName: "Denver, Colorado", weeklySalesGoal: 12, weeklyKnocksGoal: 500, accessRole: "rep" },
  { repUid: "demo-rep-jordan", displayName: "Jordan Lee", locationName: "Denver, Colorado", weeklySalesGoal: 10, weeklyKnocksGoal: 450, accessRole: "rep" },
  { repUid: "demo-rep-taylor", displayName: "Taylor Morgan", locationName: "Aurora, Colorado", weeklySalesGoal: 9, weeklyKnocksGoal: 425, accessRole: "rep" },
  { repUid: "demo-rep-casey", displayName: "Casey Rivera", locationName: "Aurora, Colorado", weeklySalesGoal: 11, weeklyKnocksGoal: 475, accessRole: "rep" },
  { repUid: "demo-rep-riley", displayName: "Riley Thompson", locationName: "Colorado Springs, Colorado", weeklySalesGoal: 8, weeklyKnocksGoal: 400, accessRole: "rep" },
  { repUid: "demo-rep-sam", displayName: "Sam Wilson", locationName: "Colorado Springs, Colorado", weeklySalesGoal: 10, weeklyKnocksGoal: 450, accessRole: "rep" },
  { repUid: "demo-rep-cameron", displayName: "Cameron Davis", locationName: "Fort Collins, Colorado", weeklySalesGoal: 7, weeklyKnocksGoal: 375, accessRole: "rep" },
];

function repDocument(rep, demoEmail, authUid) {
  const [firstName, ...lastName] = rep.displayName.split(" ");
  const isManager = rep.repUid === MANAGER_REP_UID;
  const email = isManager ? demoEmail : `${rep.repUid.replace("demo-rep-", "")}@demo.absalesdashboard.com`;
  return {
    ...rep,
    firstName,
    lastName: lastName.join(" "),
    email,
    emailNormalized: email.toLowerCase(),
    phone: "",
    salesIds: [`DEMO-${rep.repUid.slice(-5).toUpperCase()}`],
    aliases: [],
    managerUid: isManager ? null : MANAGER_REP_UID,
    managerName: isManager ? "" : "Morgan Brooks",
    teamId: TEAM_ID,
    locationId: `demo-${rep.locationName.split(",")[0].toLowerCase().replace(/\s+/g, "-")}`,
    programIds: ["ATT", "T-Fiber"],
    vendorType: "organic",
    status: "active",
    authUid: isManager ? authUid : null,
    accountStatus: isManager ? "active" : "none",
    onboarding: { onboarded: true, checks: { profile: true, training: true } },
    demoSeedId: SEED_ID,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: `seed:${SEED_ID}`,
  };
}

function buildMockWrites(db, today) {
  const random = seededRandom(20260716);
  const writes = [];
  const trackedPaths = [];
  const start = addDays(today, -83);
  let orderNumber = 100000;

  for (let offset = 0; offset < 84; offset += 1) {
    const day = addDays(start, offset);
    const dayId = dateId(day);
    const weekday = day.getUTCDay();
    if (weekday === 0) continue;

    for (let repIndex = 0; repIndex < repSeeds.length; repIndex += 1) {
      const rep = repSeeds[repIndex];
      const performanceFactor = 0.72 + repIndex * 0.055;
      const knocks = Math.max(12, Math.round((38 + random() * 52) * performanceFactor));
      const attKnocks = Math.round(knocks * (0.42 + random() * 0.2));
      const tfiberKnocks = knocks - attKnocks;
      const knockRef = db.collection("demoKnockDaily").doc(dayId).collection("reps").doc(rep.repUid);
      writes.push({ ref: knockRef, data: {
        repUid: rep.repUid,
        displayName: rep.displayName,
        managerName: rep.repUid === MANAGER_REP_UID ? "" : "Morgan Brooks",
        teamId: TEAM_ID,
        locationName: rep.locationName,
        source: "demo",
        attKnocks,
        tfiberKnocks,
        knocks,
        count: knocks,
        demoSeedId: SEED_ID,
        updatedAt: FieldValue.serverTimestamp(),
      } });
      trackedPaths.push(knockRef.path);

      const expectedSales = knocks * (0.025 + repIndex * 0.0025);
      const saleCount = Math.min(3, Math.floor(expectedSales) + (random() < expectedSales % 1 ? 1 : 0));
      for (let saleIndex = 0; saleIndex < saleCount; saleIndex += 1) {
        const provider = random() < 0.48 ? "att" : "tfiber";
        const statusRoll = random();
        const status = provider === "tfiber"
          ? statusRoll < 0.56 ? "Active" : statusRoll < 0.82 ? "Pending Installation" : statusRoll < 0.92 ? "Preorder" : "Canceled"
          : statusRoll < 0.6 ? "Installed" : statusRoll < 0.82 ? "Pending" : statusRoll < 0.92 ? "Preorder" : "Canceled";
        const orderId = `DEMO${orderNumber++}`;
        const ref = db.collection("demoSalesOrders").doc(provider).collection("orders").doc(orderId);
        const installed = status === "Active" || status === "Installed";
        const pending = status === "Pending" || status === "Pending Installation";
        const estimatedInstallationDateId = pending ? dateId(addDays(day, random() < 0.7 ? 3 + Math.floor(random() * 10) : -2)) : null;
        writes.push({ ref, data: {
          orderUid: orderId,
          orderId,
          orderDateId: dayId,
          provider,
          matchedRepUid: rep.repUid,
          matchStatus: "matched",
          matchMethod: "demo-seed",
          rawRepName: rep.displayName,
          rawManagerName: rep.repUid === MANAGER_REP_UID ? "" : "Morgan Brooks",
          rawSalesId: `DEMO-${rep.repUid.slice(-5).toUpperCase()}`,
          accountStatus: status,
          saleCount: 1,
          installationDateId: installed ? dateId(addDays(day, 2)) : null,
          estimatedInstallationDateId,
          cancellationDateId: status === "Canceled" ? dateId(addDays(day, 4)) : null,
          rawData: {
            "Customer Name": ["Avery Johnson", "Jamie Smith", "Robin Garcia", "Drew Williams", "Skyler Brown"][Math.floor(random() * 5)],
            "Account Status": status,
            "Order ID": orderId,
            Representative: rep.displayName,
          },
          demoSeedId: SEED_ID,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        } });
        trackedPaths.push(ref.path);
      }
    }
  }
  return { writes, trackedPaths };
}

async function commitWrites(db, writes) {
  for (let index = 0; index < writes.length; index += 400) {
    const batch = db.batch();
    for (const write of writes.slice(index, index + 400)) batch.set(write.ref, write.data, { merge: true });
    await batch.commit();
  }
}

async function deletePaths(db, paths) {
  for (let index = 0; index < paths.length; index += 400) {
    const batch = db.batch();
    for (const documentPath of paths.slice(index, index + 400)) batch.delete(db.doc(documentPath));
    await batch.commit();
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  const resetPassword = process.argv.includes("--reset-password");
  const demoEmail = (argument("email") || "demo@absalesdashboard.com").trim().toLowerCase();
  const superDemoEmail = (argument("super-email") || "superdemo@absalesdashboard.com").trim().toLowerCase();
  loadEnvFile(path.join(__dirname, "..", ".env.local"));
  const app = adminApp();
  const db = getFirestore(app, process.env.FIREBASE_DATABASE_ID?.trim() || "default");
  const auth = getAuth(app);
  const today = easternToday();
  const preview = buildMockWrites(db, today);

  if (!apply) {
    console.log(JSON.stringify({ mode: "dry-run", email: demoEmail, teamId: TEAM_ID, reps: repSeeds.length, mockDocuments: preview.writes.length, start: dateId(addDays(today, -83)), end: dateId(today) }, null, 2));
    console.log("Run npm run seed:demo -- --apply to create or refresh the demo workspace.");
    return;
  }

  let authUser = await auth.getUserByEmail(demoEmail).catch((error) => error?.code === "auth/user-not-found" ? null : Promise.reject(error));
  let generatedPassword = "";
  if (!authUser) {
    generatedPassword = `${randomBytes(15).toString("base64url")}!A7`;
    authUser = await auth.createUser({ email: demoEmail, displayName: "AB Marketing Demo", password: generatedPassword, emailVerified: true, disabled: false });
  } else {
    const existingProfile = await db.collection("users").doc(authUser.uid).get();
    if (existingProfile.exists && existingProfile.data()?.repUid !== MANAGER_REP_UID) throw new Error("The demo email is already linked to a non-demo account. Choose another --email value.");
    const updates = { displayName: "AB Marketing Demo", emailVerified: true, disabled: false };
    if (resetPassword) {
      generatedPassword = `${randomBytes(15).toString("base64url")}!A7`;
      updates.password = generatedPassword;
    }
    await auth.updateUser(authUser.uid, updates);
  }

  const manifestRef = db.collection("demoSeeds").doc(MANIFEST_ID);
  const existingManifest = await manifestRef.get();
  const oldPaths = Array.isArray(existingManifest.data()?.documentPaths) ? existingManifest.data().documentPaths.map(String) : [];
  if (oldPaths.length) await deletePaths(db, oldPaths);

  const { writes, trackedPaths } = buildMockWrites(db, today);
  await commitWrites(db, writes);

  const now = FieldValue.serverTimestamp();
  const legacyReferences = [
    ...repSeeds.map((rep) => db.collection("reps").doc(rep.repUid)),
    db.collection("teams").doc(TEAM_ID),
  ];
  const legacySnapshots = await db.getAll(...legacyReferences);
  const legacyDeletes = legacySnapshots.filter((snapshot) => snapshot.exists && snapshot.data()?.demoSeedId === SEED_ID).map((snapshot) => snapshot.ref.path);
  if (legacyDeletes.length) await deletePaths(db, legacyDeletes);

  const rosterWrites = repSeeds.map((rep) => ({ ref: db.collection("demoReps").doc(rep.repUid), data: { ...repDocument(rep, demoEmail, authUser.uid), createdAt: now, createdBy: `seed:${SEED_ID}` } }));
  await commitWrites(db, rosterWrites);
  await db.collection("demoTeams").doc(TEAM_ID).set({
    teamId: TEAM_ID,
    name: "Demo Showcase Team",
    description: "Isolated mock team for product demonstrations.",
    color: "#8b5cf6",
    active: true,
    managerRepUid: MANAGER_REP_UID,
    members: repSeeds.filter((rep) => rep.repUid !== MANAGER_REP_UID).map((rep) => rep.repUid),
    demoSeedId: SEED_ID,
    createdAt: now,
    createdBy: `seed:${SEED_ID}`,
    updatedAt: now,
    updatedBy: `seed:${SEED_ID}`,
  }, { merge: true });
  await db.collection("users").doc(authUser.uid).set({
    authUid: authUser.uid,
    displayName: "AB Marketing Demo",
    email: demoEmail,
    role: "manager",
    businessUnit: "fiber",
    mustChangePassword: false,
    repUid: MANAGER_REP_UID,
    managerUid: null,
    teamId: TEAM_ID,
    repAccessRole: "manager",
    dashboardScope: "managedTeam",
    locationIds: [...new Set(repSeeds.map((rep) => `demo-${rep.locationName.split(",")[0].toLowerCase().replace(/\s+/g, "-")}`))],
    permissions: dashboardOnlyPermissions(),
    demoSeedId: SEED_ID,
    createdAt: now,
    createdBy: `seed:${SEED_ID}`,
    updatedAt: now,
    updatedBy: `seed:${SEED_ID}`,
    lastLoginAt: null,
  }, { merge: true });

  let superAuthUser = await auth.getUserByEmail(superDemoEmail).catch((error) => error?.code === "auth/user-not-found" ? null : Promise.reject(error));
  let superGeneratedPassword = "";
  if (!superAuthUser) {
    superGeneratedPassword = `${randomBytes(15).toString("base64url")}!A7`;
    superAuthUser = await auth.createUser({ email: superDemoEmail, displayName: "AB Marketing Super Admin Demo", password: superGeneratedPassword, emailVerified: true, disabled: false });
  } else {
    const existingSuperProfile = await db.collection("users").doc(superAuthUser.uid).get();
    if (existingSuperProfile.exists && existingSuperProfile.data()?.demoSeedId !== SEED_ID) throw new Error("The super demo email is already linked to a non-demo account. Choose another --super-email value.");
    const updates = { displayName: "AB Marketing Super Admin Demo", emailVerified: true, disabled: false };
    if (resetPassword) {
      superGeneratedPassword = `${randomBytes(15).toString("base64url")}!A7`;
      updates.password = superGeneratedPassword;
    }
    await auth.updateUser(superAuthUser.uid, updates);
  }
  await db.collection("users").doc(superAuthUser.uid).set({
    authUid: superAuthUser.uid,
    displayName: "AB Marketing Super Admin Demo",
    email: superDemoEmail,
    role: "user",
    demoPresentationRole: "superAdmin",
    businessUnit: "all",
    mustChangePassword: false,
    repUid: null,
    managerUid: null,
    teamId: null,
    repAccessRole: null,
    dashboardScope: null,
    locationIds: [],
    permissions: dashboardOnlyPermissions(),
    demoSeedId: SEED_ID,
    createdAt: now,
    createdBy: `seed:${SEED_ID}`,
    updatedAt: now,
    updatedBy: `seed:${SEED_ID}`,
    lastLoginAt: null,
  }, { merge: true });
  await manifestRef.set({ seedId: SEED_ID, email: demoEmail, authUid: authUser.uid, teamId: TEAM_ID, repUids: repSeeds.map((rep) => rep.repUid), documentPaths: trackedPaths, refreshedAt: now }, { merge: true });

  console.log(JSON.stringify({ mode: "apply", email: demoEmail, authUid: authUser.uid, teamId: TEAM_ID, reps: repSeeds.length, mockDocuments: writes.length, passwordGenerated: Boolean(generatedPassword), password: generatedPassword || undefined, superDemoEmail, superDemoAuthUid: superAuthUser.uid, superDemoPasswordGenerated: Boolean(superGeneratedPassword), superDemoPassword: superGeneratedPassword || undefined }, null, 2));
  if (!generatedPassword) console.log("Existing demo password was preserved. Add --reset-password to generate a new one.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
