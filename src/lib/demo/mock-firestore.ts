/**
 * A minimal in-memory stand-in for the subset of the Firestore Admin SDK this
 * app actually uses (collections/subcollections, where/orderBy/limit queries,
 * batches, transactions, collectionGroup, and FieldValue sentinels). It lets
 * every existing `app/api/**` route keep calling `getAdminDb()` unchanged
 * while operating on generated demo data instead of a real project.
 */

type DocData = Record<string, unknown>;
type WhereOp = "==" | "!=" | "in" | "not-in" | "array-contains" | "array-contains-any" | ">" | ">=" | "<" | "<=";

type WhereClause = { field: string; op: WhereOp; value: unknown };
type OrderClause = { field: string; direction: "asc" | "desc" };

class MockTimestamp {
  constructor(private readonly date: Date) {}
  toDate() { return this.date; }
  toMillis() { return this.date.getTime(); }
  get seconds() { return Math.floor(this.date.getTime() / 1000); }
  get nanoseconds() { return (this.date.getTime() % 1000) * 1e6; }
  isEqual(other: unknown) { return other instanceof MockTimestamp && other.toMillis() === this.toMillis(); }
}

function isFieldValueSentinel(value: unknown): value is { methodName: string; elements?: unknown[]; operand?: number } {
  return Boolean(value) && typeof value === "object" && typeof (value as { methodName?: unknown }).methodName === "string" && (value as { methodName: string }).methodName.startsWith("FieldValue.");
}

function getField(data: DocData, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => (current && typeof current === "object" ? (current as DocData)[key] : undefined), data);
}

function setField(data: DocData, path: string, value: unknown) {
  const parts = path.split(".");
  let cursor: DocData = data;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const key = parts[index];
    const next = cursor[key];
    cursor = (next && typeof next === "object") ? (next as DocData) : (cursor[key] = {});
  }
  cursor[parts[parts.length - 1]] = value;
}

function deleteField(data: DocData, path: string) {
  const parts = path.split(".");
  let cursor: DocData = data;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const next = cursor[parts[index]];
    if (!next || typeof next !== "object") return;
    cursor = next as DocData;
  }
  delete cursor[parts[parts.length - 1]];
}

/** Resolves FieldValue sentinels and converts Dates to Timestamp-like values, mutating a working copy. */
function applyWrite(existing: DocData | undefined, incoming: DocData, merge: boolean): DocData {
  const result: DocData = merge && existing ? { ...existing } : {};
  const nowSeed = new Date();
  for (const [key, rawValue] of Object.entries(incoming)) {
    if (isFieldValueSentinel(rawValue)) {
      const current = getField(result, key);
      switch (rawValue.methodName) {
        case "FieldValue.serverTimestamp":
          setField(result, key, new MockTimestamp(nowSeed));
          break;
        case "FieldValue.delete":
          deleteField(result, key);
          break;
        case "FieldValue.arrayUnion": {
          const base = Array.isArray(current) ? [...current] : [];
          for (const element of rawValue.elements ?? []) if (!base.includes(element)) base.push(element);
          setField(result, key, base);
          break;
        }
        case "FieldValue.arrayRemove": {
          const base = Array.isArray(current) ? current : [];
          const removeSet = new Set(rawValue.elements ?? []);
          setField(result, key, base.filter((item) => !removeSet.has(item)));
          break;
        }
        case "FieldValue.increment":
          setField(result, key, (typeof current === "number" ? current : 0) + (rawValue.operand ?? 0));
          break;
        default:
          break;
      }
      continue;
    }
    setField(result, key, normalizeValue(rawValue));
  }
  return result;
}

function normalizeValue(value: unknown): unknown {
  if (value instanceof Date) return new MockTimestamp(value);
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (value && typeof value === "object" && !(value instanceof MockTimestamp)) {
    return Object.fromEntries(Object.entries(value as DocData).map(([key, inner]) => [key, normalizeValue(inner)]));
  }
  return value;
}

function cloneData(data: DocData): DocData {
  return JSON.parse(JSON.stringify(data, (_key, value) => {
    if (value instanceof MockTimestamp) return { __mockTimestamp: value.toMillis() };
    return value;
  }), (_key, value) => {
    if (value && typeof value === "object" && "__mockTimestamp" in value) return new MockTimestamp(new Date((value as { __mockTimestamp: number }).__mockTimestamp));
    return value;
  }) as DocData;
}

/** Reduces Timestamp/Date values to a comparable primitive so relational operators and sorts work correctly. */
function comparableValue(value: unknown): unknown {
  if (value instanceof MockTimestamp) return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return value;
}

function matchesClause(data: DocData, clause: WhereClause): boolean {
  const actual = comparableValue(getField(data, clause.field));
  const value = comparableValue(clause.value);
  switch (clause.op) {
    case "==": return actual === value;
    case "!=": return actual !== value;
    case "in": return Array.isArray(clause.value) && clause.value.map(comparableValue).includes(actual);
    case "not-in": return Array.isArray(clause.value) && !clause.value.map(comparableValue).includes(actual);
    case "array-contains": return Array.isArray(actual) && actual.includes(clause.value);
    case "array-contains-any": return Array.isArray(actual) && Array.isArray(clause.value) && actual.some((item) => (clause.value as unknown[]).includes(item));
    case ">": return typeof actual === typeof value && (actual as never) > (value as never);
    case ">=": return typeof actual === typeof value && (actual as never) >= (value as never);
    case "<": return typeof actual === typeof value && (actual as never) < (value as never);
    case "<=": return typeof actual === typeof value && (actual as never) <= (value as never);
    default: return true;
  }
}

let autoIdCounter = 0;
function generateId() {
  autoIdCounter += 1;
  return `demo-${Date.now().toString(36)}-${autoIdCounter}-${Math.random().toString(36).slice(2, 8)}`;
}

export class MockStore {
  private collections = new Map<string, Map<string, DocData>>();

  private bucket(path: string) {
    let bucket = this.collections.get(path);
    if (!bucket) { bucket = new Map(); this.collections.set(path, bucket); }
    return bucket;
  }

  getDoc(path: string, id: string): DocData | undefined {
    const doc = this.collections.get(path)?.get(id);
    return doc ? cloneData(doc) : undefined;
  }

  hasDoc(path: string, id: string) {
    return Boolean(this.collections.get(path)?.has(id));
  }

  listDocs(path: string): Array<{ id: string; data: DocData }> {
    const bucket = this.collections.get(path);
    if (!bucket) return [];
    return [...bucket.entries()].map(([id, data]) => ({ id, data: cloneData(data) }));
  }

  listCollectionGroup(name: string): Array<{ path: string; id: string; data: DocData }> {
    const results: Array<{ path: string; id: string; data: DocData }> = [];
    for (const [path, bucket] of this.collections.entries()) {
      if (path.split("/").pop() !== name) continue;
      for (const [id, data] of bucket.entries()) results.push({ path, id, data: cloneData(data) });
    }
    return results;
  }

  writeDoc(path: string, id: string, incoming: DocData, options: { merge?: boolean; mustExist?: boolean; mustNotExist?: boolean }) {
    const bucket = this.bucket(path);
    const existing = bucket.get(id);
    if (options.mustExist && !existing) throw new Error(`NOT_FOUND: ${path}/${id}`);
    if (options.mustNotExist && existing) throw new Error(`ALREADY_EXISTS: ${path}/${id}`);
    const next = applyWrite(existing, incoming, Boolean(options.merge));
    bucket.set(id, next);
    return next;
  }

  seedDoc(path: string, id: string, data: DocData) {
    this.bucket(path).set(id, normalizeValue(data) as DocData);
  }

  deleteDoc(path: string, id: string) {
    this.collections.get(path)?.delete(id);
  }
}

type Row = { id: string; data: DocData; path: string };

class MockQuery {
  constructor(protected store: MockStore, protected rowSource: () => Row[], protected wheres: WhereClause[] = [], protected orders: OrderClause[] = [], protected limitCount?: number) {}

  where(field: string, op: WhereOp, value: unknown): MockQuery {
    return new MockQuery(this.store, this.rowSource, [...this.wheres, { field, op, value }], this.orders, this.limitCount);
  }

  orderBy(field: string, direction: "asc" | "desc" = "asc"): MockQuery {
    return new MockQuery(this.store, this.rowSource, this.wheres, [...this.orders, { field, direction }], this.limitCount);
  }

  limit(count: number): MockQuery {
    return new MockQuery(this.store, this.rowSource, this.wheres, this.orders, count);
  }

  private rows(): Row[] {
    let rows = this.rowSource();
    for (const clause of this.wheres) rows = rows.filter(({ data }) => matchesClause(data, clause));
    for (const order of [...this.orders].reverse()) {
      rows = [...rows].sort((a, b) => {
        const left = comparableValue(getField(a.data, order.field));
        const right = comparableValue(getField(b.data, order.field));
        const cmp = left === right ? 0 : (left as never) > (right as never) ? 1 : -1;
        return order.direction === "desc" ? -cmp : cmp;
      });
    }
    if (typeof this.limitCount === "number") rows = rows.slice(0, this.limitCount);
    return rows;
  }

  async get(): Promise<MockQuerySnapshot> {
    const rows = this.rows();
    const docs = rows.map(({ id, data, path }) => new MockDocSnapshot(this.store, path, id, data, true));
    return new MockQuerySnapshot(docs);
  }
}

class MockQuerySnapshot {
  constructor(public docs: MockDocSnapshot[]) {}
  get empty() { return this.docs.length === 0; }
  get size() { return this.docs.length; }
  forEach(callback: (doc: MockDocSnapshot) => void) { this.docs.forEach(callback); }
}

class MockDocSnapshot {
  constructor(private store: MockStore, private path: string, public id: string, private snapshotData: DocData | undefined, public exists: boolean) {}
  data() { return this.snapshotData ? cloneData(this.snapshotData) : undefined; }
  get ref() { return new MockDocRef(this.store, this.path, this.id); }
}

class MockDocRef {
  constructor(private store: MockStore, public parentPath: string, public id: string) {}
  get path() { return `${this.parentPath}/${this.id}`; }
  get parent() { return new MockCollectionRef(this.store, this.parentPath); }

  collection(name: string) {
    return new MockCollectionRef(this.store, `${this.path}/${name}`);
  }

  async get() {
    const data = this.store.getDoc(this.parentPath, this.id);
    return new MockDocSnapshot(this.store, this.parentPath, this.id, data, this.store.hasDoc(this.parentPath, this.id));
  }

  async set(data: DocData, options?: { merge?: boolean }) {
    this.store.writeDoc(this.parentPath, this.id, data, { merge: options?.merge });
  }

  async update(data: DocData) {
    this.store.writeDoc(this.parentPath, this.id, data, { merge: true, mustExist: true });
  }

  async create(data: DocData) {
    this.store.writeDoc(this.parentPath, this.id, data, { merge: false, mustNotExist: true });
  }

  async delete() {
    this.store.deleteDoc(this.parentPath, this.id);
  }
}

class MockCollectionRef extends MockQuery {
  constructor(store: MockStore, public path: string) {
    super(store, () => store.listDocs(path).map(({ id, data }) => ({ id, data, path })));
  }

  doc(id?: string) {
    return new MockDocRef(this.store, this.path, id ?? generateId());
  }

  async add(data: DocData) {
    const ref = this.doc();
    await ref.set(data);
    return ref;
  }

  /** Parent document of this (sub)collection, or null for a root collection. */
  get parent(): MockDocRef | null {
    const parts = this.path.split("/");
    if (parts.length <= 1) return null;
    parts.pop();
    const id = parts.pop()!;
    return new MockDocRef(this.store, parts.join("/"), id);
  }
}

class MockCollectionGroupRef extends MockQuery {
  constructor(store: MockStore, name: string) {
    super(store, () => store.listCollectionGroup(name));
  }
}

type WriteOp = { kind: "set" | "update" | "create" | "delete"; ref: MockDocRef; data?: DocData; merge?: boolean };

class MockBatch {
  private ops: WriteOp[] = [];
  set(ref: MockDocRef, data: DocData, options?: { merge?: boolean }) { this.ops.push({ kind: "set", ref, data, merge: options?.merge }); return this; }
  update(ref: MockDocRef, data: DocData) { this.ops.push({ kind: "update", ref, data }); return this; }
  create(ref: MockDocRef, data: DocData) { this.ops.push({ kind: "create", ref, data }); return this; }
  delete(ref: MockDocRef) { this.ops.push({ kind: "delete", ref }); return this; }
  async commit() {
    for (const op of this.ops) {
      if (op.kind === "set") await op.ref.set(op.data!, { merge: op.merge });
      else if (op.kind === "update") await op.ref.update(op.data!);
      else if (op.kind === "create") await op.ref.create(op.data!);
      else await op.ref.delete();
    }
    this.ops = [];
  }
}

class MockTransaction {
  private ops: WriteOp[] = [];
  async get(target: MockDocRef | MockQuery) {
    if (target instanceof MockDocRef) return target.get();
    return target.get();
  }
  set(ref: MockDocRef, data: DocData, options?: { merge?: boolean }) { this.ops.push({ kind: "set", ref, data, merge: options?.merge }); return this; }
  update(ref: MockDocRef, data: DocData) { this.ops.push({ kind: "update", ref, data }); return this; }
  create(ref: MockDocRef, data: DocData) { this.ops.push({ kind: "create", ref, data }); return this; }
  delete(ref: MockDocRef) { this.ops.push({ kind: "delete", ref }); return this; }
  async _flush() {
    for (const op of this.ops) {
      if (op.kind === "set") await op.ref.set(op.data!, { merge: op.merge });
      else if (op.kind === "update") await op.ref.update(op.data!);
      else if (op.kind === "create") await op.ref.create(op.data!);
      else await op.ref.delete();
    }
    this.ops = [];
  }
}

export function createMockFirestore(store: MockStore) {
  return {
    collection(name: string) { return new MockCollectionRef(store, name); },
    doc(path: string) {
      const parts = path.split("/");
      const id = parts.pop()!;
      return new MockDocRef(store, parts.join("/"), id);
    },
    collectionGroup(name: string) { return new MockCollectionGroupRef(store, name); },
    batch() { return new MockBatch(); },
    async getAll(...refs: MockDocRef[]) { return Promise.all(refs.map((ref) => ref.get())); },
    async runTransaction<T>(updateFunction: (transaction: MockTransaction) => Promise<T>): Promise<T> {
      const transaction = new MockTransaction();
      const result = await updateFunction(transaction);
      await transaction._flush();
      return result;
    },
  };
}

export const MockFieldValue = {
  serverTimestamp: () => ({ methodName: "FieldValue.serverTimestamp" }),
  delete: () => ({ methodName: "FieldValue.delete" }),
  arrayUnion: (...elements: unknown[]) => ({ methodName: "FieldValue.arrayUnion", elements }),
  arrayRemove: (...elements: unknown[]) => ({ methodName: "FieldValue.arrayRemove", elements }),
  increment: (operand: number) => ({ methodName: "FieldValue.increment", operand }),
};
