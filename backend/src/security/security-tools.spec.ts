// 서버 쪽 보안 도구(Crockford base32, 서버 열쇠 나누기, 확인값 해시, TOTP, 예비 코드, 비밀값 암호화, 토큰) 단위 시험
import { TOTP } from "otpauth";
import { describe, expect, it } from "vitest";
import { hashSecret, verifySecret } from "./auth-hash.js";
import { createBackupCodes, hashBackupCode, normalizeCode } from "./backup-codes.js";
import { crockfordDecode, crockfordEncode, randomCrockford } from "./crockford.js";
import { openSecret, sealSecret } from "./secret-box.js";
import { deriveServerKeys } from "./server-keys.js";
import { createTotpSecret, otpAuthUri, verifyTotp } from "./totp.js";
import { hashToken, randomToken } from "./tokens.js";

const APP_KEY = Buffer.alloc(32, 9).toString("base64");

describe("Crockford base32", () => {
  it("바이트를 글자로 바꿨다가 그대로 되돌린다", () => {
    const bytes = Buffer.from("0011223344556677889900aabbccddeeff", "hex");
    const text = crockfordEncode(bytes);
    expect(text).toMatch(/^[0-9A-HJKMNP-TV-Z]+$/);
    expect(crockfordDecode(text, bytes.length).equals(bytes)).toBe(true);
  });

  it("소문자·하이픈·공백과 헷갈리는 글자(O→0, I·L→1)를 받아 준다", () => {
    const bytes = Buffer.from([0, 1, 2, 3, 4]);
    const text = crockfordEncode(bytes);
    const messy = text.toLowerCase().replace(/0/g, "o").replace(/1/g, "l").replace(/(.{2})/g, "$1- ");
    expect(crockfordDecode(messy, bytes.length).equals(bytes)).toBe(true);
  });

  it("쓸 수 없는 글자(U)나 길이가 틀리면 거부한다", () => {
    expect(() => crockfordDecode("U".repeat(8), 5)).toThrow();
    expect(() => crockfordDecode("00000", 5)).toThrow();
  });

  it("무작위 글자는 정한 길이와 글자 집합을 지킨다", () => {
    const code = randomCrockford(12);
    expect(code).toHaveLength(12);
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{12}$/);
  });
});

describe("서버 열쇠 나누기", () => {
  it("같은 APP_SECRET_KEY에서는 늘 같은 열쇠를, 용도마다 다른 32바이트 열쇠를 만든다", () => {
    const a = deriveServerKeys(APP_KEY);
    const b = deriveServerKeys(APP_KEY);
    expect(a.totp.equals(b.totp)).toBe(true);
    const all = [a.totp, a.backupCode, a.fakeSalt, a.token];
    for (const key of all) expect(key).toHaveLength(32);
    expect(new Set(all.map((key) => key.toString("hex"))).size).toBe(4);
  });

  it("없는 아이디에도 아이디마다 늘 같은 16바이트 가짜 소금을 준다", () => {
    const keys = deriveServerKeys(APP_KEY);
    expect(keys.fakeKdfSalt("hong")).toEqual(keys.fakeKdfSalt("HONG"));
    expect(keys.fakeKdfSalt("hong")).toHaveLength(16);
    expect(keys.fakeKdfSalt("hong").equals(keys.fakeKdfSalt("kim"))).toBe(false);
  });
});

describe("확인값 해시", () => {
  it("같은 값만 맞다고 하고, 소금이 달라 같은 값도 해시가 다르다", async () => {
    const value = Buffer.alloc(32, 1);
    const first = await hashSecret(value, 1000);
    const second = await hashSecret(value, 1000);
    expect(first.hash).not.toBe(second.hash);
    expect(await verifySecret(value, first, 1000)).toBe(true);
    expect(await verifySecret(Buffer.alloc(32, 2), first, 1000)).toBe(false);
  });

  it("길이가 32바이트가 아닌 값은 해시하지 않는다", async () => {
    await expect(hashSecret(Buffer.alloc(16), 1000)).rejects.toThrow();
  });
});

describe("TOTP", () => {
  const secret = createTotpSecret();
  const totp = new TOTP({ algorithm: "SHA1", digits: 6, period: 30, secret });
  const now = 1_800_000_000_000;

  it("등록용 주소에 발급자·아이디·비밀값을 담는다", () => {
    const uri = otpAuthUri(secret, "hong");
    expect(uri).toContain("otpauth://totp/KeyManager:hong");
    expect(uri).toContain(`secret=${secret}`);
  });

  it("지금 코드와 앞뒤 한 구간 코드를 받는다", () => {
    for (const offset of [-30_000, 0, 30_000]) {
      const code = totp.generate({ timestamp: now + offset });
      expect(verifyTotp(secret, code, null, now).ok).toBe(true);
    }
  });

  it("두 구간 이상 차이 나거나 틀린 코드는 받지 않는다", () => {
    expect(verifyTotp(secret, totp.generate({ timestamp: now - 60_000 }), null, now).ok).toBe(false);
    expect(verifyTotp(secret, "000000", null, now).ok).toBe(false);
    expect(verifyTotp(secret, "12345", null, now).ok).toBe(false);
  });

  it("한 번 성공한 구간과 그 이전 구간의 코드는 다시 받지 않는다", () => {
    const code = totp.generate({ timestamp: now });
    const first = verifyTotp(secret, code, null, now);
    expect(first.ok).toBe(true);
    expect(verifyTotp(secret, code, first.step, now).ok).toBe(false);
    const older = totp.generate({ timestamp: now - 30_000 });
    expect(verifyTotp(secret, older, first.step, now).ok).toBe(false);
  });
});

describe("예비 코드", () => {
  it("12자 코드 10개를 만들고 서로 다르다", () => {
    const codes = createBackupCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const code of codes) expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{12}$/);
  });

  it("입력 모양이 달라도 같은 코드면 같은 HMAC이 된다", () => {
    const key = deriveServerKeys(APP_KEY).backupCode;
    const code = createBackupCodes()[0];
    const typed = `${code.slice(0, 4)}-${code.slice(4, 8)} ${code.slice(8)}`.toLowerCase();
    expect(normalizeCode(typed)).toBe(code);
    expect(hashBackupCode(key, typed)).toBe(hashBackupCode(key, code));
  });
});

describe("비밀값 암호화", () => {
  const key = deriveServerKeys(APP_KEY).totp;

  it("봉한 값을 그대로 연다", () => {
    const sealed = sealSecret(key, "JBSWY3DPEHPK3PXP", "totp:user-1");
    expect(sealed.startsWith("s1.")).toBe(true);
    expect(openSecret(key, sealed, "totp:user-1")).toBe("JBSWY3DPEHPK3PXP");
  });

  it("한 글자라도 바뀌거나 용도가 다르면 열지 않는다", () => {
    const sealed = sealSecret(key, "JBSWY3DPEHPK3PXP", "totp:user-1");
    const parts = sealed.split(".");
    const tampered = [parts[0], parts[1], (parts[2][0] === "A" ? "B" : "A") + parts[2].slice(1)].join(".");
    expect(() => openSecret(key, tampered, "totp:user-1")).toThrow();
    expect(() => openSecret(key, sealed, "totp:user-2")).toThrow();
  });
});

describe("토큰", () => {
  it("32바이트 무작위 토큰을 만들고 HMAC은 같은 토큰에만 같다", () => {
    const key = deriveServerKeys(APP_KEY).token;
    const token = randomToken();
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
    expect(hashToken(key, token)).toBe(hashToken(key, token));
    expect(hashToken(key, token)).not.toBe(hashToken(key, randomToken()));
  });
});
