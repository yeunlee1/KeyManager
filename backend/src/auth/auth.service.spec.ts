// AuthService의 비밀번호 바꾸기가 그 사이 바뀐 계정 상태를 덮어쓰지 않는지(버전 조건부 갱신) 확인하는 단위 시험
import { randomBytes } from "node:crypto";
import { UnauthorizedException } from "@nestjs/common";
import type { Request, Response } from "express";
import type { DataSource, Repository } from "typeorm";
import { describe, expect, it, vi } from "vitest";
import type { User } from "../accounts/user.entity.js";
import type { AuditService } from "../audit/audit.service.js";
import { hashSecret } from "../security/auth-hash.js";
import { deriveServerKeys } from "../security/server-keys.js";
import type { AuthContext } from "./auth.decorators.js";
import { AuthService } from "./auth.service.js";
import type { Session } from "./session.entity.js";
import type { SessionsService } from "./sessions.service.js";
import type { SetupCodeService } from "./setup-code.service.js";

describe("AuthService.changePassword", () => {
  it("확인한 뒤 다른 곳에서 먼저 바뀌어 조건부 갱신이 0건이면 거부하고 새 세션을 만들지 않는다", async () => {
    const current = randomBytes(32);
    const stored = await hashSecret(current);
    const update = vi.fn(async () => ({ affected: 0 }));
    const dataSource = {
      transaction: async (work: (manager: unknown) => Promise<unknown>) => work({ update }),
    } as unknown as DataSource;
    const advance = vi.fn();
    const service = new AuthService(
      dataSource,
      {} as Repository<User>,
      { advance } as unknown as SessionsService,
      {} as SetupCodeService,
      { record: vi.fn() } as unknown as AuditService,
      deriveServerKeys(Buffer.alloc(32, 4).toString("base64")),
      { now: () => Date.now() },
    );
    const auth = {
      user: { id: "u1", authHash: stored.hash, authSalt: stored.salt, lockedUntil: null, failedAttempts: 0 },
      session: { id: "s1", authVersion: 3 },
    } as unknown as AuthContext & { session: Session };
    const dto = {
      currentAuthValue: current.toString("base64url"),
      kdfSalt: randomBytes(16).toString("base64url"),
      kdfParams: { algorithm: "argon2id" as const, memoryKiB: 65536, iterations: 3, parallelism: 4 },
      authValue: randomBytes(32).toString("base64url"),
      accountKeyMaster: `v1.${randomBytes(12).toString("base64url")}.${randomBytes(48).toString("base64url")}`,
    };

    await expect(
      service.changePassword(auth, dto, {} as Request, {} as Response),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(update).toHaveBeenCalledWith(
      expect.anything(),
      { id: "u1", authVersion: 3 },
      expect.objectContaining({ authVersion: 4 }),
    );
    expect(advance).not.toHaveBeenCalled();
  });
});
