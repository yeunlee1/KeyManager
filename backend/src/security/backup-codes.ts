// 2단계 인증 예비 코드 만들기와 서버 열쇠 HMAC
import { createHmac } from "node:crypto";
import { normalizeCrockford, randomCrockford } from "./crockford.js";

export const BACKUP_CODE_COUNT = 10;
export const BACKUP_CODE_LENGTH = 12;

export function createBackupCodes(): string[] {
  const codes = new Set<string>();
  while (codes.size < BACKUP_CODE_COUNT) codes.add(randomCrockford(BACKUP_CODE_LENGTH));
  return [...codes];
}

export function normalizeCode(input: string): string {
  return normalizeCrockford(input);
}

export function hashBackupCode(key: Buffer, input: string): string {
  return createHmac("sha256", key).update(normalizeCode(input), "utf8").digest("base64");
}
