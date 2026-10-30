// 서버만 아는 열쇠로 작은 비밀값(TOTP 비밀값)을 AES-256-GCM으로 봉하고 연다. 용도 문자열을 AAD로 묶는다.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export function sealSecret(key: Buffer, plain: string, context: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final(), cipher.getAuthTag()]);
  return `s1.${iv.toString("base64url")}.${data.toString("base64url")}`;
}

export function openSecret(key: Buffer, sealed: string, context: string): string {
  const [version, ivText, dataText, extra] = sealed.split(".");
  if (version !== "s1" || !ivText || !dataText || extra !== undefined) {
    throw new Error("봉한 값의 형식이 아닙니다.");
  }
  const iv = Buffer.from(ivText, "base64url");
  const data = Buffer.from(dataText, "base64url");
  if (iv.length !== 12 || data.length < 16) throw new Error("봉한 값의 형식이 아닙니다.");
  const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  decipher.setAAD(Buffer.from(context, "utf8"));
  decipher.setAuthTag(data.subarray(data.length - 16));
  return Buffer.concat([decipher.update(data.subarray(0, data.length - 16)), decipher.final()]).toString(
    "utf8",
  );
}
