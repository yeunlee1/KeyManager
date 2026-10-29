// 세션 서비스의 단계 전이(이미 폐기된 세션 거부)와 인증 버전 검사 단위 시험. DB 대신 메모리 저장소를 쓴다.
import { UnauthorizedException } from "@nestjs/common";
import type { Request, Response } from "express";
import type { Repository } from "typeorm";
import { describe, expect, it } from "vitest";
import type { User } from "../accounts/user.entity.js";
import type { AppEnv } from "../config/env.validation.js";
import { deriveServerKeys } from "../security/server-keys.js";
import { hashToken } from "../security/tokens.js";
import type { Session } from "./session.entity.js";
import { SessionsService } from "./sessions.service.js";

const keys = deriveServerKeys(Buffer.alloc(32, 3).toString("base64"));
const env = { COOKIE_SECURE: false } as AppEnv;

function setup(user: Partial<User>) {
  const rows: Session[] = [];
  const cookies: string[] = [];
  const sessions = {
    create: (value: Session) => ({ ...value }),
    insert: async (value: Session) => {
      rows.push(value);
    },
    findOne: async ({ where }: { where: { tokenHash: string } }) =>
      rows.find((row) => row.tokenHash === where.tokenHash && row.revokedAt === null) ?? null,
    update: async (where: { id?: string; userId?: string }, patch: Partial<Session>) => {
      const targets = rows.filter(
        (row) => row.revokedAt === null && (where.id ? row.id === where.id : row.userId === where.userId),
      );
      for (const row of targets) Object.assign(row, patch);
      return { affected: targets.length };
    },
  } as unknown as Repository<Session>;
  const users = {
    findOne: async () => ({ id: "u1", status: "active", authVersion: 1, ...user }),
  } as unknown as Repository<User>;
  const service = new SessionsService(sessions, users, keys, env);
  const req = { ip: "127.0.0.1", get: () => undefined, cookies: {} } as unknown as Request;
  const res = {
    cookie: (_name: string, value: string) => cookies.push(value),
    clearCookie: () => undefined,
  } as unknown as Response;
  return { service, rows, cookies, req, res };
}

describe("SessionsService", () => {
  it("새 세션은 사용자의 지금 인증 버전을 담는다", async () => {
    const { service, rows, req, res } = setup({ authVersion: 7 });
    await service.start("u1", "enroll_totp", req, res);
    expect(rows[0].authVersion).toBe(7);
  });

  it("이미 폐기된 세션으로는 다음 단계 세션을 만들 수 없다", async () => {
    const { service, rows, req, res } = setup({});
    const first = await service.start("u1", "pending_totp", req, res);
    await service.advance(first, "full", req, res);
    await expect(service.advance(first, "full", req, res)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(rows.filter((row) => row.stage === "full")).toHaveLength(1);
  });

  it("다음 단계 세션은 사용자의 지금 값이 아니라 지금 세션의 인증 버전을 물려받는다", async () => {
    const { service, rows, req, res } = setup({ authVersion: 1 });
    const pending = await service.start("u1", "pending_totp", req, res);
    // 가드를 지난 뒤 다른 곳에서 비밀번호를 바꿔 사용자 버전이 3이 된 상황
    const changed = setup({ authVersion: 3 });
    changed.rows.push(...rows);
    const next = await changed.service.advance(pending, "full", req, res);
    expect(next.authVersion).toBe(1);
  });

  it("상태를 바꾸는 전이는 지정한 다음 버전을 새 세션에 담는다", async () => {
    const { service, req, res } = setup({ authVersion: 4 });
    const current = await service.start("u1", "enroll_totp", req, res);
    const next = await service.advance(current, "full", req, res, undefined, 5);
    expect(next.authVersion).toBe(5);
  });

  it("사용자 인증 버전이 바뀌면 그 전에 만든 세션은 찾지 못한다", async () => {
    const { service, cookies, req, res } = setup({ authVersion: 1 });
    await service.start("u1", "full", req, res);
    const cookieReq = { cookies: { km_session: cookies[0] } } as unknown as Request;
    expect(await service.resolve(cookieReq)).not.toBeNull();

    const stale = setup({ authVersion: 2 });
    const session = { id: "s1", tokenHash: hashToken(keys.token, cookies[0]), userId: "u1", stage: "full", authVersion: 1, revokedAt: null, expiresAt: new Date(Date.now() + 60_000) } as Session;
    stale.rows.push(session);
    expect(await stale.service.resolve(cookieReq)).toBeNull();
  });
});
