// 로그인 세션을 만들고·다음 단계로 바꾸고·폐기하며, 요청의 쿠키로 세션과 사용자를 찾는 서비스
import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { Request, Response } from "express";
import { type EntityManager, IsNull, type Repository } from "typeorm";
import { User } from "../accounts/user.entity.js";
import type { AppEnv } from "../config/env.validation.js";
import { APP_ENV, SERVER_KEYS } from "../security/security.module.js";
import type { ServerKeys } from "../security/server-keys.js";
import { hashToken, randomToken } from "../security/tokens.js";
import type { AuthContext } from "./auth.decorators.js";
import { Session, type SessionStage } from "./session.entity.js";

export const SESSION_TTL_MS: Record<SessionStage, number> = {
  pending_totp: 5 * 60_000,
  enroll_totp: 15 * 60_000,
  recovery_enroll: 15 * 60_000,
  recovery: 10 * 60_000,
  full: 8 * 60 * 60_000,
};

@Injectable()
export class SessionsService {
  constructor(
    @InjectRepository(Session) private readonly sessions: Repository<Session>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @Inject(SERVER_KEYS) private readonly keys: ServerKeys,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  // Secure 쿠키만 __Host- 접두사를 쓸 수 있다. 시험(COOKIE_SECURE=false)에서는 접두사 없이 쓴다.
  get cookieName(): string {
    return this.env.COOKIE_SECURE ? "__Host-km_session" : "km_session";
  }

  async start(
    userId: string,
    stage: SessionStage,
    req: Request,
    res: Response,
    manager?: EntityManager,
  ): Promise<Session> {
    const token = randomToken();
    const repo = manager ? manager.getRepository(Session) : this.sessions;
    const session = repo.create({
      id: randomUUID(),
      tokenHash: hashToken(this.keys.token, token),
      userId,
      stage,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS[stage]),
      revokedAt: null,
      ip: req.ip?.slice(0, 64) ?? null,
      userAgent: req.get("user-agent")?.slice(0, 256) ?? null,
    });
    await repo.insert(session);
    res.cookie(this.cookieName, token, {
      httpOnly: true,
      secure: this.env.COOKIE_SECURE,
      sameSite: "strict",
      path: "/",
      maxAge: SESSION_TTL_MS[stage],
    });
    return session;
  }

  // 단계가 바뀔 때마다 옛 토큰을 폐기하고 새 토큰을 발급한다(세션 고정 공격 방지).
  async advance(
    current: Session,
    stage: SessionStage,
    req: Request,
    res: Response,
    manager?: EntityManager,
  ): Promise<Session> {
    await this.revoke(current.id, manager);
    return this.start(current.userId, stage, req, res, manager);
  }

  async resolve(req: Request): Promise<AuthContext | null> {
    const token: unknown = req.cookies?.[this.cookieName];
    if (typeof token !== "string" || token.length === 0 || token.length > 100) return null;
    const session = await this.sessions.findOne({
      where: { tokenHash: hashToken(this.keys.token, token), revokedAt: IsNull() },
    });
    if (!session || session.expiresAt.getTime() <= Date.now()) return null;
    const user = await this.users.findOne({ where: { id: session.userId } });
    if (!user || user.status === "disabled") return null;
    return { session, user };
  }

  async revoke(sessionId: string, manager?: EntityManager): Promise<void> {
    const repo = manager ? manager.getRepository(Session) : this.sessions;
    await repo.update({ id: sessionId, revokedAt: IsNull() }, { revokedAt: new Date() });
  }

  async revokeAllForUser(userId: string, manager?: EntityManager): Promise<void> {
    const repo = manager ? manager.getRepository(Session) : this.sessions;
    await repo.update({ userId, revokedAt: IsNull() }, { revokedAt: new Date() });
  }

  clearCookie(res: Response): void {
    res.clearCookie(this.cookieName, {
      httpOnly: true,
      secure: this.env.COOKIE_SECURE,
      sameSite: "strict",
      path: "/",
    });
  }
}
