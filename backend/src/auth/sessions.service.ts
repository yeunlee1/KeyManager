// 로그인 세션을 만들고·다음 단계로 바꾸고·폐기하며, 요청의 쿠키로 세션과 사용자를 찾는 서비스
import { randomUUID } from "node:crypto";
import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { Request, Response } from "express";
import { type EntityManager, IsNull, MoreThan, type Repository } from "typeorm";
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
    authVersion?: number,
  ): Promise<Session> {
    // 버전을 주지 않으면(새 로그인) 같은 트랜잭션에서 사용자의 지금 인증 버전을 읽어 담는다.
    let version = authVersion;
    if (version === undefined) {
      const user = await (manager ? manager.getRepository(User) : this.users).findOne({ where: { id: userId } });
      if (!user) throw new UnauthorizedException("로그인이 필요해요.");
      version = user.authVersion;
    }
    const token = randomToken();
    const repo = manager ? manager.getRepository(Session) : this.sessions;
    const session = repo.create({
      id: randomUUID(),
      tokenHash: hashToken(this.keys.token, token),
      userId,
      authVersion: version,
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
  // 새 세션은 지금 세션의 인증 버전을 물려받는다. 가드를 지난 뒤 다른 곳에서 버전이 바뀌었으면 새 세션도 바로 무효다.
  // 상태를 바꾸는 전이(등록·비밀번호·복구)는 조건부로 올린 다음 버전을 nextAuthVersion으로 넘긴다.
  async advance(
    current: Session,
    stage: SessionStage,
    req: Request,
    res: Response,
    manager?: EntityManager,
    nextAuthVersion: number = current.authVersion,
  ): Promise<Session> {
    // 이 세션을 폐기한 요청만 다음 단계로 갈 수 있다. 같은 세션으로 두 요청이 동시에 와도 한 번만 성공한다.
    const repo = manager ? manager.getRepository(Session) : this.sessions;
    const result = await repo.update(
      { id: current.id, revokedAt: IsNull(), expiresAt: MoreThan(new Date()) },
      { revokedAt: new Date() },
    );
    if ((result.affected ?? 0) !== 1) {
      throw new UnauthorizedException("이 로그인 단계는 이미 끝났어요. 처음부터 다시 로그인하세요.");
    }
    return this.start(current.userId, stage, req, res, manager, nextAuthVersion);
  }

  async resolve(req: Request): Promise<AuthContext | null> {
    const token: unknown = req.cookies?.[this.cookieName];
    if (typeof token !== "string" || token.length === 0 || token.length > 100) return null;
    const session = await this.sessions.findOne({
      where: { tokenHash: hashToken(this.keys.token, token), revokedAt: IsNull() },
    });
    if (!session || session.expiresAt.getTime() <= Date.now()) return null;
    const user = await this.users.findOne({ where: { id: session.userId } });
    if (!user || user.status === "disabled" || user.authVersion !== session.authVersion) return null;
    return { session, user };
  }

  async revoke(sessionId: string, manager?: EntityManager): Promise<void> {
    const repo = manager ? manager.getRepository(Session) : this.sessions;
    await repo.update({ id: sessionId, revokedAt: IsNull() }, { revokedAt: new Date() });
  }

  // 비밀번호·2단계 인증·복구 상태가 바뀔 때 부른다. 그 전의 모든 세션(어느 단계든)이 한꺼번에 무효가 된다.
  async bumpAuthVersion(userId: string, manager?: EntityManager): Promise<void> {
    const repo = manager ? manager.getRepository(User) : this.users;
    await repo.increment({ id: userId }, "authVersion", 1);
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
