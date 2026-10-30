// 공개키 확인(설계서 4.4절): 초대 MAC, 초대 비밀 잠그기, 내 계정 열쇠로 잠근 확인 기록
import { b64uDecode, b64uEncode, fromUtf8, utf8 } from "./encoding";
import { canonicalInput } from "./canonical";
import { aesDecrypt, aesEncrypt, hmacSha256 } from "./primitives";

export async function inviteMac(
  secret: Uint8Array,
  purpose: "invite-offer" | "invite-accept",
  values: string[],
): Promise<string> {
  return hmacSha256(secret, canonicalInput(purpose, values));
}

export async function sealInviteSecret(accountKey: CryptoKey, inviteId: string, secret: Uint8Array): Promise<string> {
  return aesEncrypt(accountKey, secret, `km:v1:invite-secret:${inviteId}`);
}

export async function openInviteSecret(accountKey: CryptoKey, inviteId: string, blob: string): Promise<Uint8Array> {
  return aesDecrypt(accountKey, blob, `km:v1:invite-secret:${inviteId}`);
}

// "내가 이 사람의 이 공개키들을 확인했다"는 기록
export interface TrustRecordBody {
  subjectId: string;
  loginId: string;
  encPublicKey: string;
  signPublicKey: string;
  method: "invite" | "safety-number";
  verifiedAt: string;
}

export async function sealTrustRecord(accountKey: CryptoKey, ownerId: string, body: TrustRecordBody): Promise<string> {
  return aesEncrypt(accountKey, utf8(JSON.stringify(body)), `km:v1:trust:${ownerId}:${body.subjectId}`);
}

export async function openTrustRecord(
  accountKey: CryptoKey,
  ownerId: string,
  subjectId: string,
  blob: string,
): Promise<TrustRecordBody> {
  const body = JSON.parse(fromUtf8(await aesDecrypt(accountKey, blob, `km:v1:trust:${ownerId}:${subjectId}`))) as TrustRecordBody;
  if (body.subjectId !== subjectId) throw new Error("확인 기록의 대상이 맞지 않아요.");
  return body;
}

// 초대 링크(#{토큰}.{비밀})를 만들고 읽는다. 둘 다 # 뒤에 있어 서버 요청·로그·Referer에 남지 않는다.
export function inviteFragment(token: Uint8Array, secret: Uint8Array): string {
  return `${b64uEncode(token)}.${b64uEncode(secret)}`;
}

export function parseInviteFragment(fragment: string): { token: string; secret: Uint8Array } {
  const [token, secret] = fragment.replace(/^#/, "").split(".");
  if (!token || !secret || b64uDecode(token).length !== 32 || b64uDecode(secret).length !== 32) {
    throw new Error("초대 링크가 올바르지 않아요. 받은 링크 전체를 그대로 여세요.");
  }
  return { token, secret: b64uDecode(secret) };
}
