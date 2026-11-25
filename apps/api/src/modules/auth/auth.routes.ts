import { loginSchema, type AdminUser } from "@sct/shared";
import { Router, type CookieOptions, type RequestHandler, type Response } from "express";
import { readCookie } from "../../core/http/cookies.js";
import { parseInput } from "../../core/http/validation.js";
import type { AuthService } from "./auth.service.js";

export const SESSION_COOKIE = "sct_admin";

/** Cookie HttpOnly (JS không đọc được → chống đánh cắp qua XSS) + SameSite=Strict (chống CSRF). */
const cookieOptions = (secure: boolean): CookieOptions => ({
  httpOnly: true,
  sameSite: "strict",
  secure,
  path: "/api"
});

/** Lấy người dùng đã xác thực (do requireAdmin gắn vào). */
export const currentAdmin = (res: Response) => res.locals.admin as AdminUser;

/** Middleware bảo vệ mọi route quản trị. */
export function requireAdmin(auth: AuthService): RequestHandler {
  return async (req, res, next) => {
    res.locals.admin = await auth.authenticate(readCookie(req, SESSION_COOKIE));
    res.set("Cache-Control", "no-store");
    next();
  };
}

export function authRoutes(auth: AuthService, loginLimiter: RequestHandler, secureCookie: boolean): Router {
  const router = Router();

  router.post("/login", loginLimiter, async (req, res) => {
    const { email, password } = parseInput(loginSchema, req.body, "body");
    const session = await auth.login(email, password, req.get("user-agent")?.slice(0, 300) ?? null);
    res
      .cookie(SESSION_COOKIE, session.token, { ...cookieOptions(secureCookie), expires: session.expiresAt })
      .json(session.user);
  });

  router.post("/logout", async (req, res) => {
    await auth.logout(readCookie(req, SESSION_COOKIE));
    res.clearCookie(SESSION_COOKIE, cookieOptions(secureCookie)).status(204).end();
  });

  router.get("/me", requireAdmin(auth), (_req, res) => {
    res.json(currentAdmin(res));
  });

  return router;
}
