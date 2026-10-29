// 관리 화면의 작업에 필요한 열쇠 자료를 서버의 최신 구성원 목록으로 모은다: 사람별 열쇠 교체, 관리자 올리기, 구성원 넣기·권한 바꾸기·빼기
import type { Promotion } from "@/api/admin";
import { listItems, listMembers, type DirectoryUser, type MemberRow, type Rotation } from "@/api/vault";
import { resignShare, shareGroupKey, type Permission } from "@/lib/crypto/vault";
import type { useVault } from "../vault/vault-context";
import { buildPromotion, buildRotation, type OpenGroup } from "./key-ops";

type Vault = ReturnType<typeof useVault>;

const NOT_OPEN = "열 수 없는 묶음이 있어 이 작업을 할 수 없어요. 금고 화면에서 그 묶음을 연 뒤(필요하면 안전 번호 확인) 다시 하세요.";

export function openGroupsOf(vault: Vault): OpenGroup[] {
  return vault.groups.map((group) => {
    if (group.state !== "open" || !group.keyRaw || group.name === null) throw new Error(NOT_OPEN);
    return { id: group.id, generation: group.generation, name: group.name, keyRaw: group.keyRaw };
  });
}

function signer(vault: Vault) {
  return { id: vault.me.id, signPrivateKey: vault.keys.signPrivateKey };
}

// 그 사람이 열 수 있던 묶음마다 새 세대 열쇠 자료를 만든다. onlyNonMember면 구성원이 아닌(관리자 권한만 있는) 묶음만.
export async function rotationsForUser(vault: Vault, targetId: string, onlyNonMember: boolean): Promise<Rotation[]> {
  const items = await listItems();
  const rotations: Rotation[] = [];
  for (const group of vault.groups) {
    const members = await listMembers(group.id);
    const row = members.find((member) => member.userId === targetId);
    if (!row || (onlyNonMember && row.isMember)) continue;
    if (group.state !== "open" || !group.keyRaw || group.name === null) throw new Error(NOT_OPEN);
    rotations.push(
      await buildRotation({
        group: { id: group.id, generation: group.generation, name: group.name, keyRaw: group.keyRaw },
        members,
        items,
        trust: vault.trust!,
        directory: vault.directory,
        removed: new Set([targetId]),
        me: signer(vault),
      }),
    );
  }
  return rotations;
}

export async function promotionFor(vault: Vault, target: DirectoryUser, targetKeys?: { encPublicKey: string; signPublicKey: string }): Promise<Promotion> {
  const groups = openGroupsOf(vault);
  const targetRows = new Map<string, { generation: number; isMember: boolean }>();
  for (const group of groups) {
    const row = (await listMembers(group.id)).find((member) => member.userId === target.id);
    if (row) targetRows.set(group.id, { generation: row.generation, isMember: row.isMember });
  }
  return buildPromotion({ target, trust: vault.trust!, groups, targetRows, me: signer(vault), targetKeys });
}

// 새 구성원에게 지금 세대 묶음 열쇠를 건넨다. 확인 기록(또는 관리자 승인 사슬)으로 공개키를 믿을 수 있는 사람만.
export async function newMemberShare(vault: Vault, group: OpenGroup, user: DirectoryUser, permission: Permission) {
  const keys = vault.trust?.known.get(user.id);
  if (!keys || vault.trust?.changed.has(user.id)) {
    throw new Error(`${user.name}님의 공개키를 아직 확인하지 않았어요. 내 계정이나 사용자 화면에서 안전 번호를 먼저 확인하세요.`);
  }
  const share = await shareGroupKey(group.keyRaw, {
    groupId: group.id,
    generation: group.generation,
    recipient: { id: user.id, encPublicKey: keys.encPublicKey },
    sharer: signer(vault),
    permission,
    isMember: true,
  });
  return { permission, generation: group.generation, ...share };
}

// 이미 사본이 있는 사람의 권한·구성원 여부만 바꿀 때는 같은 사본에 다시 서명한다.
export async function resignRow(vault: Vault, groupId: string, row: MemberRow, permission: Permission, isMember: boolean) {
  const shareSignature = await resignShare(vault.keys.signPrivateKey, {
    groupId,
    generation: row.generation,
    recipientId: row.userId,
    sharerId: vault.me.id,
    permission,
    isMember,
    wrappedKey: row.wrappedKey,
  });
  return { permission, generation: row.generation, wrappedKey: row.wrappedKey, shareSignature };
}

export async function memberRemoval(vault: Vault, group: OpenGroup, members: MemberRow[], row: MemberRow) {
  // 관리자는 구성원에서만 빠지고 관리자 권한 사본은 남는다. 직원을 빼면 열쇠를 바꾼다.
  if (row.role === "admin") {
    const resigned = await resignRow(vault, group.id, row, "edit", false);
    return { adminShareSignature: resigned.shareSignature, adminShareGeneration: row.generation, adminShareWrappedKey: row.wrappedKey };
  }
  const items = await listItems();
  return {
    rotation: await buildRotation({
      group,
      members,
      items,
      trust: vault.trust!,
      directory: vault.directory,
      removed: new Set([row.userId]),
      me: signer(vault),
    }),
  };
}
