// 전역 가드(AuthGuard)의 CSRF 머리글·Origin·세션 단계·관리자 역할 검사 단위 시험
import { ForbiddenException, type ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { describe, expect, it } from "vitest";
import type { AppEnv } from "../config/env.validation.js";
import { AdminOnly, type AuthContext, Public, Stages } from "./auth.decorators.js";
import { AuthGuard } from "./auth.guard.js";
import type { SessionStage } from "./session.entity.js";
import type { SessionsService } from "./sessions.service.js";

const env = { CORS_ORIGIN: "http://localhost:3000" } as AppEnv;

class Handlers {
  plain(): void {}
  @Public()
  open(): void {}
  @Stages("enroll_totp")
  enroll(): void {}
  @AdminOnly()
  admin(): void {}
}

function auth(stage: SessionStage, role: "admin" | "member" = "member"): AuthContext {
  return { session: { stage }, user: { role } } as AuthContext;
}

function run(
  handler: keyof Handlers,
  options: { method?: string; headers?: Record<string, string>; auth?: AuthContext | null } = {},
) {
  const headers = Object.fromEntries(
    Object.entries(options.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value]),
  );
  const req = { method: options.method ?? "GET", get: (name: string) => headers[name.toLowerCase()] } as {
    auth?: AuthContext;
  };
  const sessions = { resolve: async () => options.auth ?? null } as unknown as SessionsService;
  const guard = new AuthGuard(new Reflector(), sessions, env);
  const context = {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => Handlers.prototype[handler],
    getClass: () => Handlers,
  } as unknown as ExecutionContext;
  return { promise: guard.canActivate(context), req };
}

describe("AuthGuard", () => {
  it("상태를 바꾸는 요청에 X-KM-Request 머리글이 없으면 로그인 없는 요청도 막는다", async () => {
    await expect(run("open", { method: "POST" }).promise).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      run("open", { method: "POST", headers: { "X-KM-Request": "1" } }).promise,
    ).resolves.toBe(true);
  });

  it("허용하지 않은 Origin은 GET이어도 막는다", async () => {
    await expect(
      run("open", { headers: { Origin: "https://evil.example" } }).promise,
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(run("open", { headers: { Origin: "http://localhost:3000" } }).promise).resolves.toBe(true);
  });

  it("로그인이 없으면 401, 정상 단계가 아니면 403이다", async () => {
    await expect(run("plain").promise).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(run("plain", { auth: auth("pending_totp") }).promise).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    const ok = run("plain", { auth: auth("full") });
    await expect(ok.promise).resolves.toBe(true);
    expect(ok.req.auth?.session.stage).toBe("full");
  });

  it("단계를 지정한 요청은 그 단계만 받는다", async () => {
    await expect(run("enroll", { auth: auth("enroll_totp") }).promise).resolves.toBe(true);
    await expect(run("enroll", { auth: auth("full") }).promise).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("관리자 전용 요청은 직원을 막는다", async () => {
    await expect(run("admin", { auth: auth("full", "member") }).promise).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(run("admin", { auth: auth("full", "admin") }).promise).resolves.toBe(true);
  });
});
