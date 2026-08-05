import { DEMO_EMAIL, DEMO_UID, buildDemoUserProfile } from "./config";

export type DemoDocRecord = { path: string; id: string; data: Record<string, unknown> };
export type DemoAuthUserRecord = { uid: string; email: string; displayName: string; disabled: boolean; emailVerified: boolean };
export type DemoDataset = { dateId: string; docs: DemoDocRecord[]; authUsers: DemoAuthUserRecord[] };

function localDateId(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);
}

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function todayDateId() {
  return localDateId(startOfDay(new Date()));
}

const locationDefs = [
  { name: "Denver, Colorado" },
  { name: "Aurora, Colorado" },
  { name: "Colorado Springs, Colorado" },
  { name: "Fort Collins, Colorado" },
  { name: "Boulder, Colorado" },
];
const locationId = (name: string) => `loc-${name.split(",")[0].toLowerCase().replace(/\s+/g, "-")}`;

type ManagerDef = { key: string; displayName: string; locationName: string; teamId: string; teamName: string; teamColor: string; weeklySalesGoal: number; weeklyKnocksGoal: number };
type RepDef = { key: string; displayName: string; locationName: string; managerKey: string; weeklySalesGoal: number; weeklyKnocksGoal: number };

const managerDefs: ManagerDef[] = [
  { key: "morgan", displayName: "Morgan Brooks", locationName: "Denver, Colorado", teamId: "team-alpha", teamName: "Team Alpha", teamColor: "#2563eb", weeklySalesGoal: 8, weeklyKnocksGoal: 250 },
  { key: "jordan", displayName: "Jordan Lee", locationName: "Aurora, Colorado", teamId: "team-bravo", teamName: "Team Bravo", teamColor: "#7c3aed", weeklySalesGoal: 8, weeklyKnocksGoal: 250 },
  { key: "taylor", displayName: "Taylor Morgan", locationName: "Colorado Springs, Colorado", teamId: "team-charlie", teamName: "Team Charlie", teamColor: "#0ea5e9", weeklySalesGoal: 8, weeklyKnocksGoal: 250 },
];

const repDefs: RepDef[] = [
  { key: "alex", displayName: "Alex Carter", locationName: "Denver, Colorado", managerKey: "morgan", weeklySalesGoal: 12, weeklyKnocksGoal: 500 },
  { key: "casey", displayName: "Casey Rivera", locationName: "Boulder, Colorado", managerKey: "morgan", weeklySalesGoal: 11, weeklyKnocksGoal: 475 },
  { key: "riley", displayName: "Riley Thompson", locationName: "Denver, Colorado", managerKey: "morgan", weeklySalesGoal: 9, weeklyKnocksGoal: 425 },
  { key: "sam", displayName: "Sam Wilson", locationName: "Aurora, Colorado", managerKey: "jordan", weeklySalesGoal: 10, weeklyKnocksGoal: 450 },
  { key: "cameron", displayName: "Cameron Davis", locationName: "Fort Collins, Colorado", managerKey: "jordan", weeklySalesGoal: 7, weeklyKnocksGoal: 375 },
  { key: "drew", displayName: "Drew Bailey", locationName: "Aurora, Colorado", managerKey: "jordan", weeklySalesGoal: 10, weeklyKnocksGoal: 450 },
  { key: "avery", displayName: "Avery Johnson", locationName: "Colorado Springs, Colorado", managerKey: "taylor", weeklySalesGoal: 9, weeklyKnocksGoal: 425 },
  { key: "skyler", displayName: "Skyler Brown", locationName: "Colorado Springs, Colorado", managerKey: "taylor", weeklySalesGoal: 8, weeklyKnocksGoal: 400 },
  { key: "peyton", displayName: "Peyton Diaz", locationName: "Fort Collins, Colorado", managerKey: "taylor", weeklySalesGoal: 11, weeklyKnocksGoal: 475 },
];

const repUidOf = (key: string) => `demo-rep-${key}`;
const CUSTOMER_NAMES = ["Avery Johnson", "Jamie Smith", "Robin Garcia", "Drew Williams", "Skyler Brown", "Morgan Lee", "Casey Kim", "Taylor Chen"];

export function buildDemoDataset(): DemoDataset {
  const today = startOfDay(new Date());
  const docs: DemoDocRecord[] = [];
  const push = (path: string, id: string, data: Record<string, unknown>) => docs.push({ path, id, data });
  const longAgo = addDays(today, -900);

  for (const location of locationDefs) push("locations", locationId(location.name), { locationId: locationId(location.name), name: location.name, createdAt: longAgo, createdBy: "system" });
  for (const manager of managerDefs) push("managers", `mgr-${manager.key}`, { managerUid: `mgr-${manager.key}`, name: manager.displayName, createdAt: longAgo, createdBy: "system" });

  type FlatRep = { repUid: string; displayName: string; locationName: string; managerUid: string | null; managerName: string; teamId: string; accessRole: "manager" | "rep"; weeklySalesGoal: number; weeklyKnocksGoal: number; email: string };
  const flatReps: FlatRep[] = [
    ...managerDefs.map((manager): FlatRep => ({
      repUid: repUidOf(manager.key), displayName: manager.displayName, locationName: manager.locationName, managerUid: null, managerName: "", teamId: manager.teamId, accessRole: "manager", weeklySalesGoal: manager.weeklySalesGoal, weeklyKnocksGoal: manager.weeklyKnocksGoal, email: `${manager.key}@snipessystems-demo.com`,
    })),
    ...repDefs.map((rep): FlatRep => {
      const manager = managerDefs.find((entry) => entry.key === rep.managerKey)!;
      return { repUid: repUidOf(rep.key), displayName: rep.displayName, locationName: rep.locationName, managerUid: repUidOf(manager.key), managerName: manager.displayName, teamId: manager.teamId, accessRole: "rep", weeklySalesGoal: rep.weeklySalesGoal, weeklyKnocksGoal: rep.weeklyKnocksGoal, email: `${rep.key}@snipessystems-demo.com` };
    }),
  ];

  for (const rep of flatReps) {
    const [firstName, ...rest] = rep.displayName.split(" ");
    push("reps", rep.repUid, {
      repUid: rep.repUid, displayName: rep.displayName, firstName, lastName: rest.join(" "), email: rep.email, emailNormalized: rep.email.toLowerCase(), phone: "",
      salesIds: [`SS-${rep.repUid.slice(-6).toUpperCase()}`], aliases: [], managerUid: rep.managerUid, managerName: rep.managerName, teamId: rep.teamId,
      locationId: locationId(rep.locationName), locationName: rep.locationName, programIds: ["ATT", "T-Fiber"], vendorType: "organic", accessRole: rep.accessRole,
      weeklySalesGoal: rep.weeklySalesGoal, weeklyKnocksGoal: rep.weeklyKnocksGoal, socials: {}, status: "active", authUid: null, accountStatus: "none",
      onboarding: { onboarded: true, checks: { profile: true, training: true } },
      search: { displayName: rep.displayName.toLowerCase(), aliases: [], salesIds: [`ss-${rep.repUid.slice(-6)}`] },
      createdAt: longAgo, createdBy: "system", updatedAt: longAgo, updatedBy: "system",
    });
  }

  for (const manager of managerDefs) {
    const members = repDefs.filter((rep) => rep.managerKey === manager.key).map((rep) => repUidOf(rep.key));
    push("teams", manager.teamId, {
      teamId: manager.teamId, name: manager.teamName, description: `${manager.teamName} field sales team.`, color: manager.teamColor, active: true,
      managerRepUid: repUidOf(manager.key), members, createdAt: longAgo, createdBy: "system", updatedAt: longAgo, updatedBy: "system",
    });
  }

  const random = seededRandom(20260804);
  const totalDays = 730;
  const startDate = addDays(today, -(totalDays - 1));
  let orderCounter = 100000;
  const uploadEntries: Array<{ dayId: string; date: Date; provider: "att" | "tfiber"; rows: number }> = [];

  for (let offset = 0; offset < totalDays; offset += 1) {
    const day = addDays(startDate, offset);
    const dayId = localDateId(day);
    const weekday = day.getDay();
    if (weekday === 0) continue;
    let attRows = 0;
    let tfiberRows = 0;

    for (let index = 0; index < flatReps.length; index += 1) {
      const rep = flatReps[index];
      const performanceFactor = 0.62 + (index % flatReps.length) * 0.055;
      const knocks = Math.max(10, Math.round((30 + random() * 42) * performanceFactor));
      const attKnocks = Math.round(knocks * (0.4 + random() * 0.2));
      const tfiberKnocks = knocks - attKnocks;
      push(`knockDaily/${dayId}/reps`, rep.repUid, {
        repUid: rep.repUid, displayName: rep.displayName, managerName: rep.managerName, teamId: rep.teamId, locationName: rep.locationName,
        source: "demo", attKnocks, tfiberKnocks, knocks, count: knocks, updatedAt: day,
      });

      const expectedSales = knocks * (0.016 + (index % flatReps.length) * 0.0026);
      const saleCount = Math.min(3, Math.floor(expectedSales) + (random() < expectedSales % 1 ? 1 : 0));
      for (let saleIndex = 0; saleIndex < saleCount; saleIndex += 1) {
        const provider: "att" | "tfiber" = random() < 0.48 ? "att" : "tfiber";
        const statusRoll = random();
        const status = provider === "tfiber"
          ? statusRoll < 0.56 ? "Active" : statusRoll < 0.82 ? "Pending Installation" : statusRoll < 0.92 ? "Preorder" : "Canceled"
          : statusRoll < 0.6 ? "Installed" : statusRoll < 0.82 ? "Pending" : statusRoll < 0.92 ? "Preorder" : "Canceled";
        const installed = status === "Active" || status === "Installed";
        const pending = status === "Pending" || status === "Pending Installation";
        const orderId = `SS${orderCounter}`;
        orderCounter += 1;
        push(`salesOrders/${provider}/orders`, orderId, {
          orderUid: orderId, orderId, orderDateId: dayId, provider, matchedRepUid: rep.repUid, matchStatus: "matched", matchMethod: "demo-seed",
          rawRepName: rep.displayName, rawManagerName: rep.managerName, rawSalesId: `SS-${rep.repUid.slice(-6).toUpperCase()}`, accountStatus: status, saleCount: 1,
          installationDateId: installed ? localDateId(addDays(day, 2)) : null,
          estimatedInstallationDateId: pending ? localDateId(addDays(day, random() < 0.7 ? 3 + Math.floor(random() * 10) : -2)) : null,
          cancellationDateId: status === "Canceled" ? localDateId(addDays(day, 4)) : null,
          rawData: { "Customer Name": CUSTOMER_NAMES[Math.floor(random() * CUSTOMER_NAMES.length)], "Account Status": status, "Order ID": orderId, Representative: rep.displayName },
          createdAt: day, updatedAt: day,
        });
        if (provider === "att") attRows += 1; else tfiberRows += 1;
      }
    }

    if (weekday !== 6 && (attRows > 0 || tfiberRows > 0)) {
      if (attRows > 0) uploadEntries.push({ dayId, date: day, provider: "att", rows: attRows });
      if (tfiberRows > 0) uploadEntries.push({ dayId, date: day, provider: "tfiber", rows: tfiberRows });
    }
  }

  for (const entry of uploadEntries.slice(-14)) {
    const uploadId = `upload-${entry.provider}-${entry.dayId}`;
    const uploadedAt = new Date(entry.date.getFullYear(), entry.date.getMonth(), entry.date.getDate(), 8, 30);
    push("uploadRuns", uploadId, {
      uploadId, type: entry.provider === "att" ? "attSales" : "tfiberSales",
      fileName: `${entry.provider === "att" ? "ATT" : "TFiber"}_Sales_${entry.dayId}.xlsx`, storagePath: "", uploadedBy: DEMO_UID, uploadedAt,
      status: "complete", rowsRead: entry.rows, rowsValid: entry.rows, rowsSkipped: 0, rowsMatched: entry.rows, rowsUnmatched: 0,
      summary: { saleCount: entry.rows }, ingestMethod: "manual", origin: "", emailSender: "", emailSubject: "",
    });
  }

  push("users", DEMO_UID, { ...buildDemoUserProfile(), createdAt: longAgo, createdBy: "system", updatedAt: longAgo, updatedBy: "system", lastLoginAt: today });

  // Pre-mark the knock export cache "complete" (empty) so team knock exports don't
  // prompt for a manual "Prepare export data" step that depends on real file storage.
  push("system", "knockExportCache", { status: "complete", schemaVersion: 3, uploadsProcessed: 0, uploadsSkipped: 0, daysWritten: 0, rowsWritten: 0, chunkCount: 0, completedAt: today });

  return {
    dateId: localDateId(today),
    docs,
    authUsers: [{ uid: DEMO_UID, email: DEMO_EMAIL, displayName: "Snipes Systems Demo", disabled: false, emailVerified: true }],
  };
}
