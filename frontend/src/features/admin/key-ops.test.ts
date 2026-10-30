// @vitest-environment node
/// <reference types="node" />
// 관리자 열쇠 작업 시험: 열쇠 교체 받는 사람·항목 열쇠 다시 잠그기, 관리자 올리기 사본, 초대 만들기·확인 MAC
import type { DirectoryUser, ItemRow, MemberRow } from "@/api/vault";
import { createAccount } from "@/lib/crypto/account";
import { randomBytes } from "@/lib/crypto/primitives";
import { parseInviteFragment } from "@/lib/crypto/trust";
import { generateGroupKey, shareGroupKey, unwrapItemKeyRaw, wrapItemKey } from "@/lib/crypto/vault";
import type { TrustState } from "../vault/trust";
import { buildInvite, buildPromotion, buildRotation, checkInviteOffer, buildAcceptance, verifyPendingInvite, RotationBlockedError } from "./key-ops";

type Account = Awaited<ReturnType<typeof createAccount>>;

async function account(id: string, loginId: string, role: "admin" | "member"): Promise<{ acc: Account; user: DirectoryUser }> {
  const acc = await createAccount("맑은 하늘 아래 파란 금고 열쇠 2026", id);
  return {
    acc,
    user: {
      id,
      loginId,
      name: loginId,
      role,
      status: "active",
      encPublicKey: acc.material.encPublicKey,
      signPublicKey: acc.material.signPublicKey,
      adminGrantSig: null,
      adminGrantedBy: null,
    },
  };
}

const GROUP = "11111111-1111-4111-8111-111111111111";
const ITEM = "22222222-2222-4222-8222-222222222222";

function trustOf(users: DirectoryUser[], admins: string[], extra: Partial<TrustState> = {}): TrustState {
  return {
    known: new Map(users.map((u) => [u.id, { encPublicKey: u.encPublicKey, signPublicKey: u.signPublicKey, via: "record" as const }])),
    changed: new Set(),
    verifiedAdmins: new Set(admins),
    unverifiedAdmins: new Set(),
    records: new Map(),
    ...extra,
  };
}

async function memberRow(groupKey: Uint8Array, recipient: { acc: Account; user: DirectoryUser }, sharer: { acc: Account; user: DirectoryUser }, isMember: boolean, permission: "view" | "edit" = "edit"): Promise<MemberRow> {
  const share = await shareGroupKey(groupKey, {
    groupId: GROUP,
    generation: 1,
    recipient: { id: recipient.user.id, encPublicKey: recipient.user.encPublicKey },
    sharer: { id: sharer.user.id, signPrivateKey: sharer.acc.keys.signPrivateKey },
    permission,
    isMember,
  });
  return { userId: recipient.user.id, loginId: recipient.user.loginId, name: recipient.user.name, role: recipient.user.role, permission, isMember, generation: 1, sharedBy: sharer.user.id, ...share };
}

describe("열쇠 작업", () => {
  let admin: { acc: Account; user: DirectoryUser };
  let kim: { acc: Account; user: DirectoryUser };
  let lee: { acc: Account; user: DirectoryUser };

  beforeAll(async () => {
    admin = await account("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "admin", "admin");
    kim = await account("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "kim", "member");
    lee = await account("cccccccc-cccc-4ccc-8ccc-cccccccccccc", "lee", "member");
  }, 60_000);

  it("열쇠 교체는 빼는 사람을 빼고 남은 구성원과 확인된 관리자에게 새 세대 열쇠를 건네며, 항목 열쇠를 개정과 함께 다시 잠근다", async () => {
    const key = generateGroupKey();
    const members = [await memberRow(key, admin, admin, true), await memberRow(key, kim, admin, true, "view"), await memberRow(key, lee, admin, true)];
    const itemKey = randomBytes(32);
    const item = { id: ITEM, groupId: GROUP, keyGeneration: 1, revision: 3, itemKeyEnc: await wrapItemKey(itemKey, key, { itemId: ITEM, groupId: GROUP, generation: 1 }) } as ItemRow;
    const rotation = await buildRotation({
      group: { id: GROUP, generation: 1, name: "고객사 A", keyRaw: key },
      members,
      items: [item],
      trust: trustOf([admin.user, kim.user, lee.user], [admin.user.id]),
      directory: [admin.user, kim.user, lee.user],
      removed: new Set([lee.user.id]),
      me: { id: admin.user.id, signPrivateKey: admin.acc.keys.signPrivateKey },
    });
    expect(rotation.fromGeneration).toBe(1);
    expect(rotation.accesses.map((a) => [a.userId, a.permission, a.isMember]).sort()).toEqual(
      [[admin.user.id, "edit", true], [kim.user.id, "view", true]].sort(),
    );
    expect(rotation.itemKeys).toHaveLength(1);
    expect(rotation.itemKeys[0].revision).toBe(3);
    expect(Object.keys(rotation).sort()).toEqual(["accesses", "fromGeneration", "groupId", "itemKeys", "nameEnc"]);
    // 새 세대 사본을 받은 kim은 새 열쇠로 항목 열쇠를 풀 수 있다.
    const { openGroupKey } = await import("@/lib/crypto/vault");
    const kimShare = rotation.accesses.find((a) => a.userId === kim.user.id)!;
    const newKey = await openGroupKey(
      { groupId: GROUP, generation: 2, sharedBy: admin.user.id, permission: "view", isMember: true, wrappedKey: kimShare.wrappedKey, shareSignature: kimShare.shareSignature },
      { id: kim.user.id, encPrivateKey: kim.acc.keys.encPrivateKey },
      admin.user.signPublicKey,
    );
    const reopened = await unwrapItemKeyRaw(rotation.itemKeys[0].itemKeyEnc, newKey, { itemId: ITEM, groupId: GROUP, generation: 2 });
    expect(reopened).toEqual(itemKey);
  }, 60_000);

  it("확인된 관리자가 서명하지 않은 사본이 있으면 교체를 만들지 않고 그 사람을 알린다", async () => {
    const key = generateGroupKey();
    const members = [await memberRow(key, admin, admin, true), await memberRow(key, kim, lee, true)];
    await expect(
      buildRotation({
        group: { id: GROUP, generation: 1, name: "고객사 A", keyRaw: key },
        members,
        items: [],
        trust: trustOf([admin.user, kim.user, lee.user], [admin.user.id]),
        directory: [admin.user, kim.user, lee.user],
        removed: new Set(),
        me: { id: admin.user.id, signPrivateKey: admin.acc.keys.signPrivateKey },
      }),
    ).rejects.toBeInstanceOf(RotationBlockedError);
  }, 60_000);

  it("관리자로 올릴 때는 아직 지금 세대 사본이 없는 묶음에만 수정 권한 사본을 만든다", async () => {
    const key = generateGroupKey();
    const other = generateGroupKey();
    const promotion = await buildPromotion({
      target: kim.user,
      trust: trustOf([admin.user, kim.user], [admin.user.id]),
      groups: [
        { id: GROUP, generation: 1, name: "A", keyRaw: key },
        { id: "33333333-3333-4333-8333-333333333333", generation: 4, name: "B", keyRaw: other },
      ],
      targetRows: new Map([[GROUP, { generation: 1, isMember: true }]]),
      me: { id: admin.user.id, signPrivateKey: admin.acc.keys.signPrivateKey },
    });
    expect(promotion.keyShares.map((s) => [s.groupId, s.generation])).toEqual([["33333333-3333-4333-8333-333333333333", 4]]);
    expect(promotion.adminGrantSig.startsWith("v1s.")).toBe(true);
  }, 60_000);

  it("초대 링크의 비밀로 초대 내용을 확인하고, 수락 뒤 관리자가 두 MAC을 확인한다. 내용이 바뀌면 거부한다", async () => {
    const me = { id: admin.user.id, encPublicKey: admin.user.encPublicKey, signPublicKey: admin.user.signPublicKey, accountKey: admin.acc.keys.accountKey };
    const invite = await buildInvite({ loginId: "park", name: "박지성", role: "member", me, origin: "https://km.example" });
    const { token, secret } = parseInviteFragment(invite.link.split("#")[1]);
    expect(token).toBe(invite.body.token);
    const lookup = {
      inviteId: invite.body.id,
      loginId: "park",
      name: "박지성",
      role: "member" as const,
      expiresAt: invite.body.expiresAt,
      inviterMac: invite.body.inviterMac,
      inviter: { id: admin.user.id, name: "admin", encPublicKey: admin.user.encPublicKey, signPublicKey: admin.user.signPublicKey },
    };
    expect(await checkInviteOffer(lookup, secret)).toBe(true);
    expect(await checkInviteOffer({ ...lookup, role: "admin" }, secret)).toBe(false);
    const accepted = await buildAcceptance(lookup, secret, "맑은 하늘 아래 파란 금고 열쇠 2026");
    const pending = {
      inviteId: invite.body.id,
      loginId: "park",
      name: "박지성",
      role: "member" as const,
      expiresAt: invite.body.expiresAt,
      secretEnc: invite.body.secretEnc,
      inviterMac: invite.body.inviterMac,
      acceptMac: accepted.acceptMac,
      user: { id: accepted.material.id, loginId: "park", status: "pending_totp", encPublicKey: accepted.material.encPublicKey, signPublicKey: accepted.material.signPublicKey },
    };
    expect((await verifyPendingInvite(pending, me)).ok).toBe(true);
    const swapped = { ...pending, user: { ...pending.user, encPublicKey: kim.user.encPublicKey } };
    expect((await verifyPendingInvite(swapped, me)).ok).toBe(false);
  }, 60_000);
});
