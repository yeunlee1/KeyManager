// 계정 요청 본문 검증(SetupDto)의 필수 항목·범위 단위 시험
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { describe, expect, it } from "vitest";
import { SetupDto } from "./auth.dto.js";

const b64u = (bytes: number) => Buffer.alloc(bytes, 5).toString("base64url");
const aes = (bytes = 48) => `v1.${b64u(12)}.${b64u(bytes)}`;

function valid() {
  return {
    id: "6f1f2c4e-8a3b-4c2d-9e1f-0a1b2c3d4e5f",
    kdfSalt: b64u(16),
    kdfParams: { algorithm: "argon2id", memoryKiB: 65536, iterations: 3, parallelism: 4 },
    authValue: b64u(32),
    recoveryAuthValue: b64u(32),
    accountKeyMaster: aes(),
    accountKeyRecovery: aes(),
    encPublicKey: b64u(422),
    encPrivateKey: aes(1800),
    signPublicKey: b64u(91),
    signPrivateKey: aes(160),
    setupCode: "ABCDE12345",
    loginId: "Admin",
    name: "관리자",
    adminGrantSig: `v1s.${b64u(64)}`,
  };
}

async function errorsOf(body: object): Promise<string[]> {
  const errors = await validate(plainToInstance(SetupDto, body), { whitelist: true });
  return errors.map((error) => error.property);
}

describe("SetupDto", () => {
  it("모든 칸이 맞으면 통과하고 아이디는 소문자로 바꾼다", async () => {
    expect(await errorsOf(valid())).toEqual([]);
    expect(plainToInstance(SetupDto, valid()).loginId).toBe("admin");
  });

  it("비밀번호 변환 설정(kdfParams)이 빠지면 거부한다", async () => {
    const { kdfParams: _omit, ...body } = valid();
    expect(await errorsOf(body)).toContain("kdfParams");
  });

  it("변환 설정이 허용 범위를 벗어나면 거부한다", async () => {
    const body = valid();
    expect(await errorsOf({ ...body, kdfParams: { ...body.kdfParams, memoryKiB: 1024 } })).toContain("kdfParams");
    expect(await errorsOf({ ...body, kdfParams: { ...body.kdfParams, algorithm: "pbkdf2" } })).toContain("kdfParams");
  });

  it("암호문 형식이 아니거나 서명이 빠지면 거부한다", async () => {
    expect(await errorsOf({ ...valid(), accountKeyMaster: "plain-text" })).toContain("accountKeyMaster");
    const { adminGrantSig: _omit, ...body } = valid();
    expect(await errorsOf(body)).toContain("adminGrantSig");
  });
});
