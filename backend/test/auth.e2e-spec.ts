// 계정 절차(처음 설정·로그인·2단계 인증·예비 코드·잠김·비밀번호 바꾸기·복구·로그아웃·CSRF) e2e 시험
import type { NestExpressApplication } from "@nestjs/platform-express";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DataSource } from "typeorm";
import { TOTP_CLOCK } from "../src/auth/auth.service.js";
import { SetupCodeService } from "../src/auth/setup-code.service.js";
import { createTestApp } from "./setup/test-app.js";
import { truncateAccounts } from "./setup/test-db.js";
import {
  Client,
  FakeClock,
  accountMaterial,
  aesBlob,
  b64u,
  finishEnrollment,
  sigBlob,
  setupFirstAdmin,
  signIn,
  totpCode,
} from "./setup/vault-fixtures.js";

describe("계정 절차", () => {
  let app: NestExpressApplication;
  let ds: DataSource;
  const clock = new FakeClock();

  beforeAll(async () => {
    app = await createTestApp((builder) => builder.overrideProvider(TOTP_CLOCK).useValue(clock));
    ds = app.get(DataSource);
  });

  beforeEach(async () => {
    await truncateAccounts(ds);
  });

  afterAll(async () => {
    await app.close();
  });

  it("사용자가 없으면 설정이 필요하다고 알리고, 설정 코드가 틀리면 만들지 않는다", async () => {
    await app.get(SetupCodeService).refresh();
    const client = new Client(app);
    expect((await client.get("/auth/status").expect(200)).body).toEqual({ setupRequired: true });
    await client
      .post("/auth/setup", { ...accountMaterial(), setupCode: "WRONGCODE0", loginId: "admin", name: "관리자", adminGrantSig: sigBlob() })
      .expect(403);
    expect(await ds.query("SELECT id FROM users")).toHaveLength(0);
  });

  it("처음 설정 → 2단계 인증 등록으로 관리자가 생기고, 같은 코드로 다시 설정할 수 없다", async () => {
    const code = await app.get(SetupCodeService).refresh();
    const admin = await setupFirstAdmin(app, clock);
    expect(admin.backupCodes).toHaveLength(10);
    const me = await admin.client.get("/auth/me").expect(200);
    expect(me.body).toMatchObject({ loginId: "admin", role: "admin", status: "active" });
    expect(me.body.accountKeyMaster).toBe(admin.material.accountKeyMaster);
    expect(me.body).not.toHaveProperty("authHash");
    await new Client(app)
      .post("/auth/setup", { ...accountMaterial(), setupCode: code, loginId: "other", name: "다른 사람", adminGrantSig: sigBlob() })
      .expect(403);
    expect((await new Client(app).get("/auth/status").expect(200)).body).toEqual({ setupRequired: false });
  });

  it("2단계 인증 등록 전 세션으로는 내 정보·라이선스 API를 쓸 수 없다", async () => {
    const code = await app.get(SetupCodeService).refresh();
    const client = new Client(app);
    await client.post("/auth/setup", { ...accountMaterial(), setupCode: code, loginId: "admin", name: "관리자", adminGrantSig: sigBlob() }).expect(200);
    await client.get("/auth/me").expect(403);
    await client.get("/items").expect(403);
  });

  it("없는 아이디에도 같은 모양의 가짜 소금을 늘 같게 준다", async () => {
    const admin = await setupFirstAdmin(app, clock);
    const client = new Client(app);
    const real = await client.post("/auth/prelogin", { loginId: "ADMIN" }).expect(200);
    expect(real.body.kdfSalt).toBe(admin.material.kdfSalt);
    const fake1 = await client.post("/auth/prelogin", { loginId: "nobody" }).expect(200);
    const fake2 = await client.post("/auth/prelogin", { loginId: "nobody" }).expect(200);
    expect(fake1.body.kdfSalt).toBe(fake2.body.kdfSalt);
    expect(fake1.body.kdfSalt).toHaveLength(22);
    expect(fake1.body.kdfParams).toEqual(real.body.kdfParams);
  });

  it("확인값이 틀리면 아이디가 있든 없든 같은 문구로 거부하고, 맞으면 인증 코드 단계로 간다", async () => {
    const admin = await setupFirstAdmin(app, clock);
    const client = new Client(app);
    const wrong = await client.post("/auth/login", { loginId: "admin", authValue: b64u(32) }).expect(401);
    const unknown = await client.post("/auth/login", { loginId: "nobody", authValue: b64u(32) }).expect(401);
    expect(wrong.body.error).toBe(unknown.body.error);
    const ok = await client.post("/auth/login", { loginId: "admin", authValue: admin.material.authValue }).expect(200);
    expect(ok.body).toEqual({ next: "totp" });
    await client.get("/auth/me").expect(403);
    const code = totpCode(admin.totpSecret, clock);
    await client.post("/auth/login/totp", { code }).expect(200);
    await client.get("/auth/me").expect(200);
  });

  it("한 번 쓴 인증 코드는 다른 로그인에서 다시 받지 않는다", async () => {
    const admin = await setupFirstAdmin(app, clock);
    const first = new Client(app);
    await first.post("/auth/login", { loginId: "admin", authValue: admin.material.authValue }).expect(200);
    const code = totpCode(admin.totpSecret, clock);
    await first.post("/auth/login/totp", { code }).expect(200);
    const second = new Client(app);
    await second.post("/auth/login", { loginId: "admin", authValue: admin.material.authValue }).expect(200);
    await second.post("/auth/login/totp", { code }).expect(401);
  });

  it("다섯 번 틀리면 15분 잠기고, 그동안은 맞는 값도 거부한다", async () => {
    const admin = await setupFirstAdmin(app, clock);
    const client = new Client(app);
    for (let i = 0; i < 5; i++) {
      await client.post("/auth/login", { loginId: "admin", authValue: b64u(32) }).expect(401);
    }
    await client.post("/auth/login", { loginId: "admin", authValue: admin.material.authValue }).expect(429);
    const events: { action: string }[] = await ds.query(
      "SELECT action FROM audit_events WHERE action = 'login_failed' AND detail->>'locked' = 'true'",
    );
    expect(events).toHaveLength(1);
  });

  it("예비 코드로 로그인하면 2단계 인증을 새로 등록해야 하고, 같은 예비 코드는 다시 못 쓴다", async () => {
    const admin = await setupFirstAdmin(app, clock);
    const client = new Client(app);
    await client.post("/auth/login", { loginId: "admin", authValue: admin.material.authValue }).expect(200);
    const backupCode = admin.backupCodes[0];
    const used = await client.post("/auth/login/totp", { backupCode: backupCode.toLowerCase() }).expect(200);
    expect(used.body).toEqual({ next: "enroll_totp" });
    await client.get("/auth/me").expect(403);
    const again = await finishEnrollment(client, admin.material, "admin", clock);
    await again.client.get("/auth/me").expect(200);

    const other = new Client(app);
    await other.post("/auth/login", { loginId: "admin", authValue: admin.material.authValue }).expect(200);
    await other.post("/auth/login/totp", { backupCode }).expect(401);
  });

  it("비밀번호를 바꾸면 다른 세션이 끊기고 새 확인값으로만 로그인된다", async () => {
    const admin = await setupFirstAdmin(app, clock);
    const other = await signIn(app, { ...admin, authValue: admin.material.authValue }, clock);
    const next = { kdfSalt: b64u(16), kdfParams: admin.material.kdfParams, authValue: b64u(32), accountKeyMaster: aesBlob() };
    await admin.client.post("/auth/password", { ...next, currentAuthValue: b64u(32) }).expect(401);
    await admin.client.post("/auth/password", { ...next, currentAuthValue: admin.material.authValue }).expect(204);
    await admin.client.get("/auth/me").expect(200);
    await other.get("/auth/me").expect(401);
    await new Client(app).post("/auth/login", { loginId: "admin", authValue: admin.material.authValue }).expect(401);
    await signIn(app, { ...admin, authValue: next.authValue }, clock);
  });

  it("복구 키와 인증 코드로 새 마스터 비밀번호와 새 복구 키를 정한다", async () => {
    const admin = await setupFirstAdmin(app, clock);
    const client = new Client(app);
    const start = await client
      .post("/auth/recover/start", {
        loginId: "admin",
        recoveryAuthValue: admin.material.recoveryAuthValue,
        code: totpCode(admin.totpSecret, clock),
      })
      .expect(200);
    expect(start.body).toEqual({ next: "recovery" });
    await admin.client.get("/auth/me").expect(401);
    const material = await client.get("/auth/recover/material").expect(200);
    expect(material.body.accountKeyRecovery).toBe(admin.material.accountKeyRecovery);
    const next = {
      kdfSalt: b64u(16),
      kdfParams: admin.material.kdfParams,
      authValue: b64u(32),
      accountKeyMaster: aesBlob(),
      recoveryAuthValue: b64u(32),
      accountKeyRecovery: aesBlob(),
    };
    await client.post("/auth/recover/complete", next).expect(204);
    await client.get("/auth/me").expect(200);
    await new Client(app)
      .post("/auth/recover/start", { loginId: "admin", recoveryAuthValue: admin.material.recoveryAuthValue, code: totpCode(admin.totpSecret, clock) })
      .expect(401);
    await signIn(app, { ...admin, authValue: next.authValue }, clock);
  });

  it("복구 키와 예비 코드만 있으면 2단계 인증을 새로 등록한 뒤 복구를 마친다", async () => {
    const admin = await setupFirstAdmin(app, clock);
    const client = new Client(app);
    const start = await client
      .post("/auth/recover/start", {
        loginId: "admin",
        recoveryAuthValue: admin.material.recoveryAuthValue,
        backupCode: admin.backupCodes[1],
      })
      .expect(200);
    expect(start.body).toEqual({ next: "enroll_totp" });
    await client.get("/auth/recover/material").expect(403);
    const enrollStart = await client.post("/auth/totp/enroll/start").expect(200);
    const confirm = await client
      .post("/auth/totp/enroll/confirm", { code: totpCode(enrollStart.body.secret, clock) })
      .expect(200);
    expect(confirm.body.next).toBe("recovery");
    await client.get("/auth/recover/material").expect(200);
  });

  it("CSRF 머리글이 없거나 다른 출처에서 온 요청은 거부한다", async () => {
    const admin = await setupFirstAdmin(app, clock);
    await admin.client.agent.post("/auth/logout").expect(403);
    await admin.client.post("/auth/logout").set("Origin", "https://evil.example").expect(403);
    await admin.client.get("/auth/me").expect(200);
  });

  it("로그아웃하면 세션을 폐기하고, 세션 쿠키는 httpOnly·SameSite=Strict다", async () => {
    await app.get(SetupCodeService).refresh();
    const code = await app.get(SetupCodeService).refresh();
    const client = new Client(app);
    const res = await client
      .post("/auth/setup", { ...accountMaterial(), setupCode: code, loginId: "admin", name: "관리자", adminGrantSig: sigBlob() })
      .expect(200);
    const cookie = String(res.headers["set-cookie"]);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain("Path=/");
    await client.post("/auth/logout").expect(204);
    await client.post("/auth/totp/enroll/start").expect(401);
  });
});
