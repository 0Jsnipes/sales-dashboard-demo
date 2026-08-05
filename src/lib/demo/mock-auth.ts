/**
 * Minimal in-memory stand-in for the handful of Firebase Admin Auth methods
 * this app actually calls (createUser/updateUser/deleteUser/getUser/getUserByEmail).
 * `verifyIdToken` is never called in demo mode — `requireActor` short-circuits
 * on the demo session sentinel before it would be reached — so it throws loudly
 * if something unexpectedly calls it, rather than silently doing the wrong thing.
 */

type MockAuthUser = {
  uid: string;
  email: string;
  displayName?: string;
  disabled: boolean;
  emailVerified: boolean;
};

function authError(code: string, message: string) {
  const error = new Error(message) as Error & { code: string };
  error.code = code;
  return error;
}

let autoUidCounter = 0;
function generateUid() {
  autoUidCounter += 1;
  return `demo-auth-${Date.now().toString(36)}-${autoUidCounter}`;
}

export class MockAuth {
  private byUid = new Map<string, MockAuthUser>();
  private byEmail = new Map<string, string>();

  seedUser(user: MockAuthUser) {
    this.byUid.set(user.uid, user);
    this.byEmail.set(user.email.toLowerCase(), user.uid);
  }

  async getUser(uid: string) {
    const user = this.byUid.get(uid);
    if (!user) throw authError("auth/user-not-found", `No demo auth user for uid ${uid}`);
    return user;
  }

  async getUserByEmail(email: string) {
    const uid = this.byEmail.get(email.trim().toLowerCase());
    if (!uid) throw authError("auth/user-not-found", `No demo auth user for email ${email}`);
    return this.byUid.get(uid)!;
  }

  async createUser(options: { uid?: string; email: string; password?: string; displayName?: string; emailVerified?: boolean; disabled?: boolean }) {
    const uid = options.uid ?? generateUid();
    const user: MockAuthUser = { uid, email: options.email, displayName: options.displayName, disabled: options.disabled ?? false, emailVerified: options.emailVerified ?? false };
    this.seedUser(user);
    return user;
  }

  async updateUser(uid: string, updates: Partial<Pick<MockAuthUser, "displayName" | "disabled" | "emailVerified">> & { password?: string; email?: string }) {
    const user = await this.getUser(uid);
    const next: MockAuthUser = { ...user, ...updates, email: updates.email ?? user.email };
    this.byUid.set(uid, next);
    if (updates.email) { this.byEmail.delete(user.email.toLowerCase()); this.byEmail.set(next.email.toLowerCase(), uid); }
    return next;
  }

  async deleteUser(uid: string) {
    const user = this.byUid.get(uid);
    if (!user) throw authError("auth/user-not-found", `No demo auth user for uid ${uid}`);
    this.byUid.delete(uid);
    this.byEmail.delete(user.email.toLowerCase());
  }

  async verifyIdToken(): Promise<never> {
    throw new Error("MockAuth.verifyIdToken should never be called in demo mode — requireActor() bypasses it via the demo session sentinel.");
  }
}

export function createMockAuth() {
  return new MockAuth();
}
