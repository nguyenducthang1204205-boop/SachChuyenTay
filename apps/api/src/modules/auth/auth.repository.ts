import { and, count, eq, gt, lte } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { adminSessions, adminUsers, type AdminUserRow } from "../../db/schema.js";

export interface AuthRepository {
  countUsers(): Promise<number>;
  findUserByEmail(email: string): Promise<AdminUserRow | null>;
  createUser(input: { email: string; name: string; passwordHash: string }): Promise<AdminUserRow>;
  touchLogin(userId: number): Promise<void>;
  createSession(input: { id: string; userId: number; expiresAt: Date; userAgent: string | null }): Promise<void>;
  /** Trả về người dùng nếu phiên còn hạn và tài khoản còn hoạt động. */
  findUserBySession(sessionId: string, now: Date): Promise<AdminUserRow | null>;
  deleteSession(sessionId: string): Promise<void>;
  deleteExpiredSessions(now: Date): Promise<void>;
}

export class DrizzleAuthRepository implements AuthRepository {
  constructor(private readonly db: Database) {}

  async countUsers() {
    const [row] = await this.db.select({ n: count() }).from(adminUsers);
    return row?.n ?? 0;
  }

  async findUserByEmail(email: string) {
    const [row] = await this.db.select().from(adminUsers).where(eq(adminUsers.email, email)).limit(1);
    return row ?? null;
  }

  async createUser(input: { email: string; name: string; passwordHash: string }) {
    const [row] = await this.db.insert(adminUsers).values(input).returning();
    if (!row) throw new Error("Không tạo được tài khoản quản trị");
    return row;
  }

  async touchLogin(userId: number) {
    await this.db.update(adminUsers).set({ lastLoginAt: new Date() }).where(eq(adminUsers.id, userId));
  }

  async createSession(input: { id: string; userId: number; expiresAt: Date; userAgent: string | null }) {
    await this.db.insert(adminSessions).values(input);
  }

  async findUserBySession(sessionId: string, now: Date) {
    const [row] = await this.db
      .select({ user: adminUsers })
      .from(adminSessions)
      .innerJoin(adminUsers, eq(adminSessions.userId, adminUsers.id))
      .where(and(eq(adminSessions.id, sessionId), gt(adminSessions.expiresAt, now), eq(adminUsers.isActive, true)))
      .limit(1);
    return row?.user ?? null;
  }

  async deleteSession(sessionId: string) {
    await this.db.delete(adminSessions).where(eq(adminSessions.id, sessionId));
  }

  async deleteExpiredSessions(now: Date) {
    await this.db.delete(adminSessions).where(lte(adminSessions.expiresAt, now));
  }
}
