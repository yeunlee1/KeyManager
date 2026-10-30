// 관리자 브라우저가 만드는 열쇠 자료(설계서 4.4·4.5·5.1·5.2절): 묶음 만들기, 열쇠 교체, 관리자 올리기, 초대 만들기·확인과 초대 수락
import type { InviteLookup, PendingVerification, Promotion } from "@/api/admin";
import type { AccessGrant, DirectoryUser, ItemRow, MemberRow, Rotation } from "@/api/vault";
import { createAccount } from "@/lib/crypto/account";
import { b64uEncode, utf8 } from "@/lib/crypto/encoding";
import { randomBytes, sign } from "@/lib/crypto/primitives";
import { inviteFragment, inviteMac, openInviteSecret, sealInviteSecret, sealTrustRecord } from "@/lib/crypto/trust";
import {
  encryptGroupName,
  generateGroupKey,
  shareGroupKey,
  unwrapItemKeyRaw,
  verifyShare,
  wrapItemKey,
  type Permission,
} from "@/lib/crypto/vault";
import { adminGrantInput, type TrustState } from "../vault/trust";

export const INVITE_TTL_MS = 72 * 60 * 60 * 1000;

export interface OpenGroup {
  id: string;
  generation: number;
  name: string;
  keyRaw: Uint8Array;
}

export interface Signer {
  id: string;
  signPrivateKey: CryptoKey;
}

interface Recipient {
  id: string;
  encPublicKey: string;
  permission: Permission;
  isMember: boolean;
}

export interface SkippedPerson {
  userId: string;
  name: string;
  reason: string;
}

// 받을 사람을 다 정하지 못해 열쇠 교체를 만들 수 없을 때. 서버도 남은 사람 목록이 맞지 않으면 받지 않는다.
export class RotationBlockedError extends Error {
  constructor(public readonly skipped: SkippedPerson[]) {
    super(
      `확인하지 못한 사람이 있어 열쇠를 바꿀 수 없어요: ${skipped.map((person) => `${person.name}(${person.reason})`).join(", ")}. 사용자 화면에서 안전 번호를 확인한 뒤 다시 하세요.`,
    );
  }
}

function displayName(directory: Map<string, DirectoryUser>, userId: string, fallback?: string | null): string {
  return directory.get(userId)?.name ?? fallback ?? "알 수 없는 사용자";
}

// 새 세대 열쇠를 받을 사람: 지금 세대 사본의 서명이 확인된 관리자의 것으로 맞는 사람 − 빼는 사람 + 확인된 관리자 전원
async function rotationRecipients(
  groupId: string,
  generation: number,
  members: MemberRow[],
  trust: TrustState,
  directory: DirectoryUser[],
  removed: ReadonlySet<string>,
): Promise<Recipient[]> {
  const byId = new Map(directory.map((user) => [user.id, user]));
  const recipients = new Map<string, Recipient>();
  const skipped: SkippedPerson[] = [];
  for (const row of members) {
    if (removed.has(row.userId) || row.generation !== generation) continue;
    const name = displayName(byId, row.userId, row.name);
    const sharerKey = trust.verifiedAdmins.has(row.sharedBy) ? trust.known.get(row.sharedBy)?.signPublicKey : undefined;
    const signed =
      !!sharerKey &&
      (await verifyShare(
        { groupId, generation, wrappedKey: row.wrappedKey, shareSignature: row.shareSignature, sharedBy: row.sharedBy, permission: row.permission, isMember: row.isMember },
        row.userId,
        sharerKey,
      ));
    if (!signed) {
      skipped.push({ userId: row.userId, name, reason: "사본 서명을 확인할 수 없어요" });
      continue;
    }
    const user = byId.get(row.userId);
    if (!user) continue;
    if (trust.changed.has(row.userId)) {
      skipped.push({ userId: row.userId, name, reason: "공개키가 바뀌었어요" });
      continue;
    }
    const encPublicKey = trust.known.get(row.userId)?.encPublicKey ?? user.encPublicKey;
    recipients.set(row.userId, { id: row.userId, encPublicKey, permission: row.permission, isMember: row.isMember });
  }
  for (const adminId of trust.verifiedAdmins) {
    if (removed.has(adminId) || recipients.has(adminId)) continue;
    const keys = trust.known.get(adminId);
    if (!keys) continue;
    recipients.set(adminId, { id: adminId, encPublicKey: keys.encPublicKey, permission: "edit", isMember: false });
  }
  for (const adminId of trust.unverifiedAdmins) {
    if (!removed.has(adminId)) skipped.push({ userId: adminId, name: displayName(byId, adminId), reason: "관리자 승인을 확인할 수 없어요" });
  }
  if (skipped.length) throw new RotationBlockedError(skipped);
  return [...recipients.values()];
}

async function shareAll(keyRaw: Uint8Array, groupId: string, generation: number, recipients: Recipient[], me: Signer): Promise<AccessGrant[]> {
  return Promise.all(
    recipients.map(async (recipient) => ({
      userId: recipient.id,
      permission: recipient.permission,
      isMember: recipient.isMember,
      ...(await shareGroupKey(keyRaw, {
        groupId,
        generation,
        recipient: { id: recipient.id, encPublicKey: recipient.encPublicKey },
        sharer: me,
        permission: recipient.permission,
        isMember: recipient.isMember,
      })),
    })),
  );
}

export async function buildRotation(input: {
  group: OpenGroup;
  members: MemberRow[];
  items: ItemRow[];
  trust: TrustState;
  directory: DirectoryUser[];
  removed: ReadonlySet<string>;
  me: Signer;
}): Promise<Rotation> {
  const { group, me } = input;
  const recipients = await rotationRecipients(group.id, group.generation, input.members, input.trust, input.directory, input.removed);
  const next = group.generation + 1;
  const newKey = generateGroupKey();
  try {
    const accesses = await shareAll(newKey, group.id, next, recipients, me);
    const itemKeys = [];
    for (const item of input.items.filter((row) => row.groupId === group.id)) {
      const raw = await unwrapItemKeyRaw(item.itemKeyEnc, group.keyRaw, { itemId: item.id, groupId: group.id, generation: item.keyGeneration ?? 0 });
      itemKeys.push({
        itemId: item.id,
        revision: item.revision,
        itemKeyEnc: await wrapItemKey(raw, newKey, { itemId: item.id, groupId: group.id, generation: next }),
      });
      raw.fill(0);
    }
    return {
      groupId: group.id,
      fromGeneration: group.generation,
      nameEnc: await encryptGroupName(newKey, group.id, next, group.name),
      accesses,
      itemKeys,
    };
  } finally {
    newKey.fill(0);
  }
}

// 묶음 만들기: 확인된 관리자 전원(만드는 사람은 구성원)과 고른 구성원에게 1세대 열쇠를 건넨다.
export async function buildNewGroup(input: {
  name: string;
  members: { userId: string; permission: Permission }[];
  trust: TrustState;
  directory: DirectoryUser[];
  me: Signer;
}): Promise<{ id: string; nameEnc: string; accesses: AccessGrant[] }> {
  const { trust, me } = input;
  const byId = new Map(input.directory.map((user) => [user.id, user]));
  const skipped: SkippedPerson[] = [...trust.unverifiedAdmins].map((userId) => ({
    userId,
    name: displayName(byId, userId),
    reason: "관리자 승인을 확인할 수 없어요",
  }));
  const recipients = new Map<string, Recipient>();
  for (const adminId of trust.verifiedAdmins) {
    const keys = trust.known.get(adminId);
    if (keys) recipients.set(adminId, { id: adminId, encPublicKey: keys.encPublicKey, permission: "edit", isMember: adminId === me.id });
  }
  for (const member of input.members) {
    const keys = trust.known.get(member.userId);
    if (!keys || keys.via === "admin-chain" && !trust.verifiedAdmins.has(member.userId)) {
      skipped.push({ userId: member.userId, name: displayName(byId, member.userId), reason: "공개키를 아직 확인하지 않았어요" });
      continue;
    }
    recipients.set(member.userId, { id: member.userId, encPublicKey: keys.encPublicKey, permission: member.permission, isMember: true });
  }
  if (skipped.length) throw new RotationBlockedError(skipped);
  const id = crypto.randomUUID();
  const key = generateGroupKey();
  try {
    return {
      id,
      nameEnc: await encryptGroupName(key, id, 1, input.name),
      accesses: await shareAll(key, id, 1, [...recipients.values()], me),
    };
  } finally {
    key.fill(0);
  }
}

// 관리자로 올리기: 승인 서명과, 대상에게 지금 세대 사본이 없는 모든 묶음의 수정 권한 사본
export async function buildPromotion(input: {
  target: DirectoryUser;
  trust: TrustState;
  groups: OpenGroup[];
  targetRows: Map<string, { generation: number; isMember: boolean }>;
  me: Signer;
  // 초대 MAC으로 방금 확인한 공개키처럼 아직 확인 기록에 없는 경우 직접 넘긴다.
  targetKeys?: { encPublicKey: string; signPublicKey: string };
}): Promise<Promotion> {
  const keys = input.targetKeys ?? input.trust.known.get(input.target.id);
  if (!keys || (!input.targetKeys && input.trust.changed.has(input.target.id))) {
    throw new Error(`${input.target.name}님의 공개키를 아직 확인하지 않았어요. 안전 번호를 먼저 확인하세요.`);
  }
  const keyShares = [];
  for (const group of input.groups) {
    const row = input.targetRows.get(group.id);
    if (row && row.generation === group.generation) continue;
    const share = await shareGroupKey(group.keyRaw, {
      groupId: group.id,
      generation: group.generation,
      recipient: { id: input.target.id, encPublicKey: keys.encPublicKey },
      sharer: input.me,
      permission: "edit",
      isMember: row?.isMember ?? false,
    });
    keyShares.push({ groupId: group.id, generation: group.generation, ...share });
  }
  return {
    adminGrantSig: await sign(input.me.signPrivateKey, adminGrantInput({ ...input.target, encPublicKey: keys.encPublicKey, signPublicKey: keys.signPublicKey })),
    keyShares,
  };
}

export interface InviterIdentity {
  id: string;
  encPublicKey: string;
  signPublicKey: string;
  accountKey: CryptoKey;
}

const offerValues = (inviteId: string, inviterId: string, loginId: string, name: string, role: string, expiresAt: string, enc: string, signKey: string) => [
  inviteId,
  inviterId,
  loginId,
  b64uEncode(utf8(name)),
  role,
  expiresAt,
  enc,
  signKey,
];

export async function buildInvite(input: {
  loginId: string;
  name: string;
  role: "admin" | "member";
  me: InviterIdentity;
  origin: string;
}) {
  const id = crypto.randomUUID();
  const token = randomBytes(32);
  const secret = randomBytes(32);
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();
  const { me } = input;
  const body = {
    id,
    token: b64uEncode(token),
    loginId: input.loginId,
    name: input.name,
    role: input.role,
    expiresAt,
    secretEnc: await sealInviteSecret(me.accountKey, id, secret),
    inviterMac: await inviteMac(secret, "invite-offer", offerValues(id, me.id, input.loginId, input.name, input.role, expiresAt, me.encPublicKey, me.signPublicKey)),
  };
  const link = `${input.origin}/invite#${inviteFragment(token, secret)}`;
  secret.fill(0);
  return { body, link };
}

// 초대받은 사람: 링크의 비밀로 초대 내용과 관리자 공개키가 바뀌지 않았는지 확인한다.
export async function checkInviteOffer(lookup: InviteLookup, secret: Uint8Array): Promise<boolean> {
  const expected = await inviteMac(
    secret,
    "invite-offer",
    offerValues(lookup.inviteId, lookup.inviter.id, lookup.loginId, lookup.name, lookup.role, lookup.expiresAt, lookup.inviter.encPublicKey, lookup.inviter.signPublicKey),
  );
  return expected === lookup.inviterMac;
}

// 초대받은 사람: 계정 열쇠를 모두 만들고, 수락 MAC과 초대한 관리자에 대한 내 확인 기록을 만든다.
export async function buildAcceptance(lookup: InviteLookup, secret: Uint8Array, password: string) {
  const userId = crypto.randomUUID();
  const created = await createAccount(password, userId);
  const acceptMac = await inviteMac(secret, "invite-accept", [
    lookup.inviteId,
    userId,
    lookup.loginId,
    lookup.role,
    created.material.encPublicKey,
    created.material.signPublicKey,
  ]);
  const inviterTrustRecordEnc = await sealTrustRecord(created.keys.accountKey, userId, {
    subjectId: lookup.inviter.id,
    loginId: "",
    encPublicKey: lookup.inviter.encPublicKey,
    signPublicKey: lookup.inviter.signPublicKey,
    method: "invite",
    verifiedAt: new Date().toISOString(),
  });
  return { ...created, acceptMac, inviterTrustRecordEnc };
}

// 초대한 관리자: 내가 잠가 둔 초대 비밀로 두 MAC을 다시 계산해 맞을 때만 그 사람에 대한 확인 기록을 만든다.
export async function verifyPendingInvite(
  pending: PendingVerification,
  me: InviterIdentity,
): Promise<{ ok: true; trustRecordEnc: string } | { ok: false; reason: string }> {
  let secret: Uint8Array;
  try {
    secret = await openInviteSecret(me.accountKey, pending.inviteId, pending.secretEnc);
  } catch {
    return { ok: false, reason: "초대 비밀을 열 수 없어요. 이 초대를 취소하고 새로 만드세요." };
  }
  try {
    const offer = await inviteMac(secret, "invite-offer", offerValues(pending.inviteId, me.id, pending.loginId, pending.name, pending.role, pending.expiresAt, me.encPublicKey, me.signPublicKey));
    const accept = await inviteMac(secret, "invite-accept", [
      pending.inviteId,
      pending.user.id,
      pending.loginId,
      pending.role,
      pending.user.encPublicKey,
      pending.user.signPublicKey,
    ]);
    if (offer !== pending.inviterMac || accept !== pending.acceptMac || pending.user.loginId !== pending.loginId) {
      return { ok: false, reason: "초대 수락 정보가 바뀌었을 수 있어요. 이 사람과 안전 번호를 직접 비교하세요." };
    }
    const trustRecordEnc = await sealTrustRecord(me.accountKey, me.id, {
      subjectId: pending.user.id,
      loginId: pending.user.loginId,
      encPublicKey: pending.user.encPublicKey,
      signPublicKey: pending.user.signPublicKey,
      method: "invite",
      verifiedAt: new Date().toISOString(),
    });
    return { ok: true, trustRecordEnc };
  } finally {
    secret.fill(0);
  }
}
