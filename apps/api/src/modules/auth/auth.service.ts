import { createHash, randomBytes } from "node:crypto";
import type { AdminUser } from "@sct/shared";
import { UnauthorizedError } from "../../core/errors.js";
import type { Logger } from "../../core/logger.js";
import type { AdminUserRow } from "../../db/schema.js";
import type { AuthRepository } from "./auth.repository.js";
import { hashPassword, verifyPassword } from "./password.js";

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const toAdminUser = (u: AdminUserRow): AdminUser => ({ id: u.id, email: u.email, name: u.name });

/**
 * Hash của một mật khẩu giả để thời gian phản hồi giống nhau dù email có tồn tại hay không.
 * Tính lười ở lần đăng nhập đầu: Cloudflare Workers cấm sinh số ngẫu nhiên ở global scope.
 */
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= hashPassword("dummy-password-for-timing"));

export class AuthService {
  constructor(
    private readonly repo: AuthRepository,
    private readonly sessionTtlHours: number,
    private readonly logger: Logger
  ) {}

  /** Đăng nhập: trả về token (đặt vào cookie) và thông tin người dùng. */
  async login(email: string, password: string, userAgent: string | null) {
    const user = await this.repo.findUserByEmail(email);
    const ok = await verifyPassword(password, user?.passwordHash ?? (await getDummyHash()));
    if (!user || !user.isActive || !ok) {
      this.logger.warn("Admin login failed");
      throw new UnauthorizedError("Email hoặc mật khẩu không đúng.");
    }

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + this.sessionTtlHours * 3_600_000);
    await this.repo.createSession({ id: hashToken(token), userId: user.id, expiresAt, userAgent });
    await this.repo.touchLogin(user.id);
    void this.repo.deleteExpiredSessions(new Date()).catch(() => undefined);
    this.logger.info({ adminId: user.id }, "Admin logged in");
    return { token, expiresAt, user: toAdminUser(user) };
  }

  async authenticate(token: string | undefined): Promise<AdminUser> {
    if (!token) throw new UnauthorizedError();
    const user = await this.repo.findUserBySession(hashToken(token), new Date());
    if (!user) throw new UnauthorizedError("Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.");
    return toAdminUser(user);
  }

  async logout(token: string | undefined) {
    if (token) await this.repo.deleteSession(hashToken(token));
  }

  /** Tạo tài khoản quản trị đầu tiên từ cấu hình nếu hệ thống chưa có ai. */
  async ensureInitialAdmin(input: { email?: string | undefined; password?: string | undefined; name: string }) {
    if (!input.email || !input.password) return false;
    if ((await this.repo.countUsers()) > 0) return false;
    await this.createAdmin(input.email, input.password, input.name);
    this.logger.info({ email: input.email }, "Initial admin account created");
    return true;
  }

  async createAdmin(email: string, password: string, name: string) {
    if (password.length < 8) throw new Error("Mật khẩu quản trị phải có ít nhất 8 ký tự");
    return toAdminUser(
      await this.repo.createUser({
        email: email.trim().toLowerCase(),
        name,
        passwordHash: await hashPassword(password)
      })
    );
  }
}
