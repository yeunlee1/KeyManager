// 묶음 열쇠 건네기·받기(서명 확인), 묶음 이름, 항목 열쇠와 요약·비밀 덩어리 암호화(설계서 4.4~4.7절)
import { canonicalInput } from "./canonical";
import { type Bytes, fromUtf8, utf8 } from "./encoding";
import { aesDecrypt, aesEncrypt, importAesKey, randomBytes, rsaUnwrap, rsaWrap, sign, verify } from "./primitives";

export const SUMMARY_MAX_BYTES = 16_384;
export const SECRET_MAX_BYTES = 32_768;

export type Permission = "view" | "edit";

export function generateGroupKey(): Bytes {
  return randomBytes(32);
}

const groupKeyLabel = (groupId: string, generation: number, recipientId: string) =>
  `km:v1:group-key:${groupId}:g${generation}:${recipientId}`;

function shareInput(
  groupId: string,
  generation: number,
  recipientId: string,
  sharerId: string,
  permission: Permission,
  isMember: boolean,
  wrappedKey: string,
): string {
  return canonicalInput("group-key-share", [
    groupId,
    String(generation),
    recipientId,
    sharerId,
    permission,
    String(isMember),
    wrappedKey,
  ]);
}

export interface ShareInput {
  groupId: string;
  generation: number;
  recipient: { id: string; encPublicKey: string };
  sharer: { id: string; signPrivateKey: CryptoKey };
  permission: Permission;
  isMember: boolean;
}

export async function shareGroupKey(groupKeyRaw: Uint8Array, input: ShareInput) {
  const wrappedKey = await rsaWrap(
    input.recipient.encPublicKey,
    groupKeyRaw,
    groupKeyLabel(input.groupId, input.generation, input.recipient.id),
  );
  const shareSignature = await sign(
    input.sharer.signPrivateKey,
    shareInput(input.groupId, input.generation, input.recipient.id, input.sharer.id, input.permission, input.isMember, wrappedKey),
  );
  return { wrappedKey, shareSignature };
}

// 이미 있는 사본의 권한·구성원 여부가 바뀔 때 같은 사본에 다시 서명한다.
export async function resignShare(
  signPrivateKey: CryptoKey,
  share: { groupId: string; generation: number; recipientId: string; sharerId: string; permission: Permission; isMember: boolean; wrappedKey: string },
): Promise<string> {
  return sign(
    signPrivateKey,
    shareInput(share.groupId, share.generation, share.recipientId, share.sharerId, share.permission, share.isMember, share.wrappedKey),
  );
}

export interface ReceivedShare {
  groupId: string;
  generation: number;
  wrappedKey: string;
  shareSignature: string;
  sharedBy: string;
  permission: Permission;
  isMember: boolean;
}

// 사본의 서명이 그 관리자의 것인지 확인한다(받는 사람·관리자 명단 확인 모두에 쓴다).
export async function verifyShare(share: ReceivedShare, recipientId: string, sharerSignPublicKey: string): Promise<boolean> {
  return verify(
    sharerSignPublicKey,
    shareInput(share.groupId, share.generation, recipientId, share.sharedBy, share.permission, share.isMember, share.wrappedKey),
    share.shareSignature,
  );
}

// 확인한 관리자의 서명이 맞을 때만 묶음 열쇠를 꺼낸다. sharerSignPublicKey는 내 확인 기록에서 가져온 값이어야 한다.
export async function openGroupKey(
  share: ReceivedShare,
  me: { id: string; encPrivateKey: CryptoKey },
  sharerSignPublicKey: string,
): Promise<Bytes> {
  if (!(await verifyShare(share, me.id, sharerSignPublicKey))) {
    throw new Error("묶음 열쇠를 건넨 관리자의 서명이 맞지 않아요.");
  }
  return rsaUnwrap(me.encPrivateKey, share.wrappedKey, groupKeyLabel(share.groupId, share.generation, me.id));
}

export async function encryptGroupName(groupKeyRaw: Uint8Array, groupId: string, generation: number, name: string): Promise<string> {
  return aesEncrypt(await importAesKey(groupKeyRaw), utf8(name), `km:v1:group-name:${groupId}:g${generation}`);
}

export async function decryptGroupName(groupKeyRaw: Uint8Array, groupId: string, generation: number, nameEnc: string): Promise<string> {
  return fromUtf8(await aesDecrypt(await importAesKey(groupKeyRaw), nameEnc, `km:v1:group-name:${groupId}:g${generation}`));
}

export type ItemKeyContext =
  | { itemId: string; groupId: string; generation: number }
  | { itemId: string; userId: string };

const itemKeyAad = (context: ItemKeyContext) =>
  "groupId" in context
    ? `km:v1:item-key:${context.itemId}:group:${context.groupId}:g${context.generation}`
    : `km:v1:item-key:${context.itemId}:user:${context.userId}`;

export async function wrapItemKey(itemKeyRaw: Uint8Array, wrappingKeyRaw: Uint8Array, context: ItemKeyContext): Promise<string> {
  return aesEncrypt(await importAesKey(wrappingKeyRaw), itemKeyRaw, itemKeyAad(context));
}

export async function unwrapItemKeyRaw(blob: string, wrappingKeyRaw: Uint8Array, context: ItemKeyContext): Promise<Bytes> {
  return aesDecrypt(await importAesKey(wrappingKeyRaw), blob, itemKeyAad(context));
}

export async function unwrapItemKey(blob: string, wrappingKeyRaw: Uint8Array, context: ItemKeyContext): Promise<CryptoKey> {
  return importAesKey(await unwrapItemKeyRaw(blob, wrappingKeyRaw, context));
}

// 항목을 만들거나 고칠 때마다 새 항목 열쇠로 요약·비밀을 따로 잠근다(옛 항목 열쇠로 새 내용을 풀 수 없게).
export async function encryptItem(content: { summary: unknown; secret: unknown }, itemId: string, revision: number) {
  const summary = utf8(JSON.stringify(content.summary));
  const secret = utf8(JSON.stringify(content.secret));
  if (summary.length > SUMMARY_MAX_BYTES) throw new Error("목록 정보(이름·주소 등)가 너무 길어요.");
  if (secret.length > SECRET_MAX_BYTES) throw new Error("비밀번호·메모가 너무 길어요.");
  const itemKeyRaw = randomBytes(32);
  const itemKey = await importAesKey(itemKeyRaw);
  return {
    itemKeyRaw,
    summaryEnc: await aesEncrypt(itemKey, summary, `km:v1:item-summary:${itemId}:r${revision}`),
    secretEnc: await aesEncrypt(itemKey, secret, `km:v1:item-secret:${itemId}:r${revision}`),
  };
}

export async function decryptItem<T = unknown>(summaryEnc: string, itemKey: CryptoKey, itemId: string, revision: number): Promise<T> {
  return JSON.parse(fromUtf8(await aesDecrypt(itemKey, summaryEnc, `km:v1:item-summary:${itemId}:r${revision}`))) as T;
}

export async function decryptSecret<T = unknown>(secretEnc: string, itemKey: CryptoKey, itemId: string, revision: number): Promise<T> {
  return JSON.parse(fromUtf8(await aesDecrypt(itemKey, secretEnc, `km:v1:item-secret:${itemId}:r${revision}`))) as T;
}
