// AuthService가 확인한 시점의 계정 상태(인증 버전)로만 세션을 만들고 바꾸는지 확인하는 단위 시험(DB 대신 가짜 저장소)
import { randomBytes } from "node:crypto";
import { UnauthorizedException } from "@nestjs/common";
import type { Request, Response } from "express";
import type { DataSource, Repository } from "typeorm";
import { describe, expect, it, vi } from "vitest";
import type { User } from "../accounts/user.entity.js";
import type { AuditService } from "../audit/audit.service.js";
import { type SecretHash, hashSecret } from "../security/auth-hash.js";
import { deriveServerKeys } from "../security/server-keys.js";
import type { AuthContext } from "./auth.decorators.js";
import { AuthService } from "./auth.service.js";
import type { Session } from "./session.entity.js";
import type { SessionsService } from "./sessions.service.js";
import type { SetupCodeService } from "./setup-code.service.js";

const KDF = { algorithm: "argon2id" as const, memoryKiB: 65536, iterations: 3, parallelism: 4 };
const b64u = (bytes: number) => randomBytes(bytes).toString("base64url");

interface Fakes {
  update?: (criteria: unknown, changes: unknown) => Promise<{ affected: number }>;
  user?: Partial<User>;
}

function build(fakes: Fakes = {}) {
  const update = vi.fn(fakes.update ?? (async () => ({ affected: 1 })));
  const query = vi.fn(async () => [{ id: "u1" }]);
  const manager = { update, query, getRepository: () => ({}) };
  const dataSource = {
    transaction: async (work: (m: unknown) => Promise<unknown>) => work(manager),
    query,
  } as unknown as DataSource;
  const start = vi.fn(async () => ({}) as Session);
  const advance = vi.fn(async () => ({}) as Session);
  const users = { findOne: vi.fn(async () => fakes.user ?? null) } as unknown as Repository<User>;
  const service = new AuthService(
    dataSource,
    users,
    { start, advance } as unknown as SessionsService,
    {} as SetupCodeService,
    { record: vi.fn() } as unknown as AuditService,
    deriveServerKeys(Buffer.alloc(32, 4).toString("base64")),
    { now: () => Date.now() },
  );
  return { service, update, start, advance };
}

async function snapshot(value: Buffer, recovery: Buffer, extra: Partial<User> = {}): Promise<Partial<User>> {
  const auth: SecretHash = await hashSecret(value);
  const rec: SecretHash = await hashSecret(recovery);
  return {
    id: "u1",
    loginId: "hong",
    status: "active",
    authHash: auth.hash,
    authSalt: auth.salt,
    recoveryAuthHash: rec.hash,
    recoveryAuthSalt: rec.salt,
    lockedUntil: null,
    failedAttempts: 0,
    totpSecretEnc: null,
    ...extra,
  };
}

describe("AuthService", () => {
  it("새 로그인은 비밀번호를 확인한 사용자 스냅샷의 인증 버전으로 세션을 만든다", async () => {
    const value = randomBytes(32);
    const user = await snapshot(value, randomBytes(32), { authVersion: 2 });
    const { service, start } = build({ user });
    await service.login({ loginId: "hong", authValue: value.toString("base64url") }, {} as Request, {} as Response);
    expect(start).toHaveBeenCalledWith("u1", "enroll_totp", expect.anything(), expect.anything(), undefined, 2);
  });

  it("복구 시작은 확인한 버전일 때만 버전을 올리고, 그 사이 바뀌었으면 세션을 만들지 않는다", async () => {
    const recovery = randomBytes(32);
    const user = await snapshot(randomBytes(32), recovery, { authVersion: 5 });
    const dto = { loginId: "hong", recoveryAuthValue: recovery.toString("base64url") };

    const changed = build({ user, update: async () => ({ affected: 0 }) });
    await expect(changed.service.recoverStart(dto, {} as Request, {} as Response)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(changed.update).toHaveBeenCalledWith(
      expect.anything(),
      { id: "u1", authVersion: 5 },
      expect.objectContaining({ authVersion: 6 }),
    );
    expect(changed.start).not.toHaveBeenCalled();

    const ok = build({ user });
    await ok.service.recoverStart(dto, {} as Request, {} as Response);
    expect(ok.start).toHaveBeenCalledWith("u1", "recovery_enroll", expect.anything(), expect.anything(), expect.anything(), 6);
  });

  it("비밀번호를 확인한 뒤 다른 곳에서 먼저 바뀌어 조건부 갱신이 0건이면 거부하고 새 세션을 만들지 않는다", async () => {
    const current = randomBytes(32);
    const user = await snapshot(current, randomBytes(32));
    const { service, update, advance } = build({ update: async () => ({ affected: 0 }) });
    const auth = { user, session: { id: "s1", authVersion: 3 } } as unknown as AuthContext;
    const dto = {
      currentAuthValue: current.toString("base64url"),
      kdfSalt: b64u(16),
      kdfParams: KDF,
      authValue: b64u(32),
      accountKeyMaster: `v1.${b64u(12)}.${b64u(48)}`,
    };
    await expect(service.changePassword(auth, dto, {} as Request, {} as Response)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(update).toHaveBeenCalledWith(
      expect.anything(),
      { id: "u1", authVersion: 3 },
      expect.objectContaining({ authVersion: 4 }),
    );
    expect(advance).not.toHaveBeenCalled();
  });
});
