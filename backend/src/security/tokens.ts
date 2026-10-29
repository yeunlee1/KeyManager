// 세션·초대 토큰을 만들고, DB에는 서버 열쇠 HMAC만 남긴다
import { createHmac, randomBytes } from "node:crypto";

export function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(key: Buffer, token: string): string {
  return createHmac("sha256", key).update(token, "utf8").digest("base64");
}
