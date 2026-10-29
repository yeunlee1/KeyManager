// APP_SECRET_KEY 하나에서 용도별 서버 열쇠(TOTP 봉인, 예비 코드 HMAC, 가짜 소금, 토큰 HMAC)를 HKDF로 나눈다
import { createHmac, hkdfSync } from "node:crypto";

export interface ServerKeys {
  totp: Buffer;
  backupCode: Buffer;
  fakeSalt: Buffer;
  token: Buffer;
  // 없는 아이디에도 같은 모양의 소금을 돌려줘 아이디가 있는지 알 수 없게 한다.
  fakeKdfSalt(loginId: string): Buffer;
}

export function deriveServerKeys(appSecretKeyBase64: string): ServerKeys {
  const ikm = Buffer.from(appSecretKeyBase64, "base64");
  const derive = (purpose: string): Buffer =>
    Buffer.from(hkdfSync("sha256", ikm, Buffer.alloc(0), `km:v1:server:${purpose}`, 32));
  const fakeSalt = derive("fake-salt");
  return {
    totp: derive("totp"),
    backupCode: derive("backup-code"),
    fakeSalt,
    token: derive("token"),
    fakeKdfSalt: (loginId) =>
      createHmac("sha256", fakeSalt)
        .update(loginId.trim().toLowerCase(), "utf8")
        .digest()
        .subarray(0, 16),
  };
}
