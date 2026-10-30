// e2e 시험에서 브라우저 대신 형식만 맞는 가짜 열쇠 자료·인증 코드·요청 도우미를 만든다(서버는 암호문을 풀지 않는다)
import { randomBytes, randomUUID } from "node:crypto";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Secret, TOTP } from "otpauth";
import request from "supertest";
import type { DataSource } from "typeorm";
import { SetupCodeService } from "../../src/auth/setup-code.service.js";
import { deriveServerKeys } from "../../src/security/server-keys.js";
import { hashToken, randomToken } from "../../src/security/tokens.js";
import { TEST_APP_SECRET_KEY } from "./test-db.js";

export const b64u = (bytes: number): string => randomBytes(bytes).toString("base64url");
export const aesBlob = (bytes = 48): string => `v1.${b64u(12)}.${b64u(bytes)}`;
export const rsaBlob = (): string => `v1r.${b64u(384)}`;
export const sigBlob = (): string => `v1s.${b64u(64)}`;

export const KDF = { algorithm: "argon2id", memoryKiB: 65536, iterations: 3, parallelism: 4 };

export function accountMaterial() {
  return {
    id: randomUUID(),
    kdfSalt: b64u(16),
    kdfParams: { ...KDF },
    authValue: b64u(32),
    recoveryAuthValue: b64u(32),
    accountKeyMaster: aesBlob(),
    accountKeyRecovery: aesBlob(),
    encPublicKey: b64u(422),
    encPrivateKey: aesBlob(1800),
    signPublicKey: b64u(91),
    signPrivateKey: aesBlob(160),
  };
}

export type AccountMaterial = ReturnType<typeof accountMaterial>;

// 2단계 인증의 "이미 쓴 구간" 검사 때문에 같은 30초 안에서 여러 번 확인하려면 시계를 앞으로 돌려야 한다.
export class FakeClock {
  private time = Date.now();
  now(): number {
    return this.time;
  }
  tick(ms = 30_000): void {
    this.time += ms;
  }
}

export function totpCode(secret: string, clock: FakeClock): string {
  clock.tick();
  return new TOTP({ algorithm: "SHA1", digits: 6, period: 30, secret: Secret.fromBase32(secret) }).generate({
    timestamp: clock.now(),
  });
}

// 응답의 Set-Cookie에서 세션 토큰만 꺼낸다(로그아웃·폐기 뒤 옛 토큰으로 다시 요청해 보는 시험용).
export function sessionTokenOf(res: { headers: Record<string, unknown> }): string {
  const match = /km_session=([^;]+)/.exec(String(res.headers["set-cookie"]));
  if (!match) throw new Error("응답에 세션 쿠키가 없습니다.");
  return match[1];
}

// 쿠키를 기억하고, 상태를 바꾸는 요청에는 CSRF 머리글을 붙이는 시험용 브라우저.
// fixedCookie를 주면 그 쿠키를 모든 요청에 직접 붙인다(DB에 바로 넣은 세션용).
export class Client {
  readonly agent: ReturnType<typeof request.agent>;
  constructor(
    app: NestExpressApplication,
    private readonly fixedCookie?: string,
  ) {
    this.agent = request.agent(app.getHttpServer());
  }
  private prep<T extends { set(name: string, value: string): T }>(req: T, mutating: boolean): T {
    const withCookie = this.fixedCookie ? req.set("Cookie", this.fixedCookie) : req;
    return mutating ? withCookie.set("X-KM-Request", "1") : withCookie;
  }
  get(path: string) {
    return this.prep(this.agent.get(path), false);
  }
  post(path: string, body?: object) {
    return this.prep(this.agent.post(path), true).send(body ?? {});
  }
  put(path: string, body?: object) {
    return this.prep(this.agent.put(path), true).send(body ?? {});
  }
  patch(path: string, body?: object) {
    return this.prep(this.agent.patch(path), true).send(body ?? {});
  }
  delete(path: string, body?: object) {
    return this.prep(this.agent.delete(path), true).send(body ?? {});
  }
}

export interface SignedInUser {
  client: Client;
  // 처음 설정에 실제로 쓴 코드(처음 설정으로 만든 경우만)
  setupCode?: string;
  material: AccountMaterial;
  loginId: string;
  totpSecret: string;
  backupCodes: string[];
}

// 처음 설정 화면과 같은 순서로 첫 관리자를 만들고 2단계 인증까지 마친다.
export async function setupFirstAdmin(
  app: NestExpressApplication,
  clock: FakeClock,
  loginId = "admin",
): Promise<SignedInUser> {
  const code = await app.get(SetupCodeService).refresh();
  if (!code) throw new Error("사용자 표가 비어 있지 않아 처음 설정 코드를 만들 수 없습니다.");
  const client = new Client(app);
  const material = accountMaterial();
  await client
    .post("/auth/setup", { ...material, setupCode: code, loginId, name: "관리자", adminGrantSig: sigBlob() })
    .expect(200);
  return { ...(await finishEnrollment(client, material, loginId, clock)), setupCode: code };
}

export async function finishEnrollment(
  client: Client,
  material: AccountMaterial,
  loginId: string,
  clock: FakeClock,
): Promise<SignedInUser> {
  const start = await client.post("/auth/totp/enroll/start").expect(200);
  const totpSecret: string = start.body.secret;
  const confirm = await client
    .post("/auth/totp/enroll/confirm", { code: totpCode(totpSecret, clock) })
    .expect(200);
  return { client, material, loginId, totpSecret, backupCodes: confirm.body.backupCodes };
}

// 로그인(확인값 → 인증 코드)을 처음부터 다시 해 새 세션을 만든다.
export async function signIn(
  app: NestExpressApplication,
  user: Pick<SignedInUser, "loginId" | "totpSecret"> & { authValue: string },
  clock: FakeClock,
): Promise<Client> {
  const client = new Client(app);
  const login = await client.post("/auth/login", { loginId: user.loginId, authValue: user.authValue }).expect(200);
  if (login.body.next !== "totp") throw new Error(`예상하지 못한 다음 단계: ${login.body.next}`);
  await client.post("/auth/login/totp", { code: totpCode(user.totpSecret, clock) }).expect(200);
  return client;
}

// 라이선스 시험처럼 로그인 절차 자체가 대상이 아닌 시험에서 쓰는 빠른 로그인(DB에 사용자와 세션을 바로 넣는다)
export async function quickSession(
  app: NestExpressApplication,
  ds: DataSource,
  role: "admin" | "member" = "member",
): Promise<{ client: Client; userId: string }> {
  const material = accountMaterial();
  await ds.query(
    `INSERT INTO users (id, login_id, name, role, status, kdf_salt, kdf_params, auth_hash, auth_salt,
       recovery_auth_hash, recovery_auth_salt, account_key_master, account_key_recovery,
       enc_public_key, enc_private_key, sign_public_key, sign_private_key, admin_grant_sig)
     VALUES ($1, $2, '시험', $3, 'active', $4, $5, 'x', 'x', 'x', 'x', $6, $7, $8, $9, $10, $11, $12)`,
    [
      material.id,
      `user-${material.id.slice(0, 8)}`,
      role,
      material.kdfSalt,
      JSON.stringify(material.kdfParams),
      material.accountKeyMaster,
      material.accountKeyRecovery,
      material.encPublicKey,
      material.encPrivateKey,
      material.signPublicKey,
      material.signPrivateKey,
      role === "admin" ? sigBlob() : null,
    ],
  );
  const token = randomToken();
  await ds.query(
    `INSERT INTO sessions (id, token_hash, user_id, auth_version, stage, expires_at)
     VALUES ($1, $2, $3, 1, 'full', now() + interval '1 hour')`,
    [randomUUID(), hashToken(deriveServerKeys(TEST_APP_SECRET_KEY).token, token), material.id],
  );
  return { client: new Client(app, `km_session=${token}`), userId: material.id };
}

// 관리자가 초대를 만든다(초대 비밀 S·MAC은 형식만 맞는 가짜 값). 링크에 들어갈 토큰을 돌려준다.
export async function createInvite(
  admin: SignedInUser,
  clock: FakeClock,
  options: { loginId: string; role?: "admin" | "member"; name?: string },
): Promise<{ inviteId: string; token: string }> {
  const inviteId = randomUUID();
  const token = b64u(32);
  await admin.client
    .post("/invites", {
      id: inviteId,
      token,
      loginId: options.loginId,
      name: options.name ?? options.loginId,
      role: options.role ?? "member",
      expiresAt: new Date(Date.now() + 72 * 60 * 60_000 - 60_000).toISOString(),
      secretEnc: aesBlob(),
      inviterMac: b64u(32),
      totpCode: totpCode(admin.totpSecret, clock),
    })
    .expect(201);
  return { inviteId, token };
}

// 초대받은 사람이 링크로 가입하고 2단계 인증까지 마친다.
export async function acceptInvite(
  app: NestExpressApplication,
  token: string,
  loginId: string,
  clock: FakeClock,
): Promise<SignedInUser> {
  const client = new Client(app);
  const material = accountMaterial();
  await client
    .post("/invites/accept", { ...material, token, acceptMac: b64u(32), inviterTrustRecordEnc: aesBlob(200) })
    .expect(200);
  return finishEnrollment(client, material, loginId, clock);
}

// 묶음 열쇠 사본 하나(형식만 맞는 가짜 RSA 사본과 서명)
export function grant(userId: string, permission: "view" | "edit" = "edit", isMember = true) {
  return { userId, permission, isMember, wrappedKey: rsaBlob(), shareSignature: sigBlob() };
}
