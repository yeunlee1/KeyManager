// 묶음 열쇠 사본의 권한 판단, 열쇠 교체(세대 올리기), 관리자 올리기의 서버 쪽 규칙. 서버는 열쇠를 풀지 못하고 목록·세대가 빠짐없는지만 확인한다.
import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { type EntityManager, In } from "typeorm";
import { User } from "../accounts/user.entity.js";
import type { KeyShareDto } from "../accounts/dto/accounts.dto.js";
import type { RotationDto } from "./dto/vault.dto.js";
import { VaultGroupAccess } from "./vault-group-access.entity.js";
import { VaultGroup } from "./vault-group.entity.js";
import { VaultItem } from "./vault-item.entity.js";

const LIST_CHANGED = "열쇠를 받을 사람이나 항목 목록이 서버와 달라요. 새로 불러온 뒤 다시 하세요.";

function sameSet(a: Iterable<string>, b: Iterable<string>): boolean {
  const left = new Set(a);
  const right = new Set(b);
  return left.size === right.size && [...left].every((value) => right.has(value));
}

@Injectable()
export class VaultAccessService {
  // 묶음 하나를 열 수 있는지(보기 이상). 관리자도 사본이 있어야 연다.
  async accessOf(manager: EntityManager, groupId: string, userId: string): Promise<VaultGroupAccess | null> {
    return manager.getRepository(VaultGroupAccess).findOne({ where: { groupId, userId } });
  }

  async requireAccess(
    manager: EntityManager,
    groupId: string,
    user: User,
    need: "view" | "edit",
  ): Promise<VaultGroupAccess> {
    const access = await this.accessOf(manager, groupId, user.id);
    if (!access) throw new ForbiddenException("이 묶음을 열 권한이 없어요.");
    // 관리자는 구성원이 아니어도 수정 권한으로 연다(결정 5.12).
    if (need === "edit" && access.permission !== "edit" && user.role !== "admin") {
      throw new ForbiddenException("이 묶음은 보기만 할 수 있어요.");
    }
    return access;
  }

  // 묶음 열쇠를 새 세대로 바꾼다. removed에 든 사람은 빠지고, 남은 사람 전원과 모든 항목 열쇠가 빠짐없이 와야 한다.
  async applyRotation(
    manager: EntityManager,
    actorId: string,
    rotation: RotationDto,
    removed: ReadonlySet<string>,
  ): Promise<number> {
    const group = await manager.getRepository(VaultGroup).findOne({
      where: { id: rotation.groupId },
      lock: { mode: "pessimistic_write" },
    });
    if (!group) throw new NotFoundException("묶음이 없어요.");
    if (group.generation !== rotation.fromGeneration) {
      throw new ConflictException("다른 사람이 먼저 열쇠를 바꿨어요. 새로 불러온 뒤 다시 하세요.");
    }
    const accessRepo = manager.getRepository(VaultGroupAccess);
    const current = await accessRepo.find({ where: { groupId: group.id } });
    const remaining = current.filter((row) => !removed.has(row.userId));
    if (!sameSet(rotation.accesses.map((a) => a.userId), remaining.map((row) => row.userId))) {
      throw new ConflictException(LIST_CHANGED);
    }
    for (const grant of rotation.accesses) {
      const row = remaining.find((item) => item.userId === grant.userId);
      // 교체 중에는 권한·구성원 여부를 바꾸지 않는다(서명에 담긴 값과 서버 값이 같아야 한다).
      if (!row || row.permission !== grant.permission || row.isMember !== grant.isMember) {
        throw new ConflictException(LIST_CHANGED);
      }
    }
    const items = await manager.getRepository(VaultItem).find({ where: { groupId: group.id }, select: { id: true } });
    if (!sameSet(rotation.itemKeys.map((k) => k.itemId), items.map((item) => item.id))) {
      throw new ConflictException(LIST_CHANGED);
    }

    const next = group.generation + 1;
    await manager.update(VaultGroup, { id: group.id }, { generation: next, nameEnc: rotation.nameEnc });
    if (removed.size > 0) await accessRepo.delete({ groupId: group.id, userId: In([...removed]) });
    for (const grant of rotation.accesses) {
      await accessRepo.update(
        { groupId: group.id, userId: grant.userId },
        { generation: next, wrappedKey: grant.wrappedKey, sharedBy: actorId, shareSignature: grant.shareSignature },
      );
    }
    // 빠진 사람이 볼 수 있었던 항목이므로 실제 비밀번호를 바꾸라고 표시한다.
    for (const key of rotation.itemKeys) {
      await manager.update(
        VaultItem,
        { id: key.itemId, groupId: group.id },
        { itemKeyEnc: key.itemKeyEnc, keyGeneration: next, needsRotation: removed.size > 0 ? true : undefined },
      );
    }
    return next;
  }

  // 한 사람이 열 수 있는 묶음마다 교체 자료가 빠짐없이 있는지 확인한 뒤 모두 적용한다(비활성화·관리자 내리기).
  async rotateAllFor(
    manager: EntityManager,
    actorId: string,
    targetId: string,
    rotations: RotationDto[],
    onlyNonMember = false,
  ): Promise<string[]> {
    const rows = await manager.getRepository(VaultGroupAccess).find({ where: { userId: targetId } });
    const affected = rows.filter((row) => !onlyNonMember || !row.isMember).map((row) => row.groupId);
    if (!sameSet(rotations.map((r) => r.groupId), affected)) {
      throw new ConflictException("열쇠를 바꿔야 하는 묶음 목록이 서버와 달라요. 새로 불러온 뒤 다시 하세요.");
    }
    for (const rotation of rotations) await this.applyRotation(manager, actorId, rotation, new Set([targetId]));
    return affected;
  }

  // 관리자로 올린다. 아직 사본이 없는 모든 묶음의 지금 세대 사본이 빠짐없이 와야 한다.
  async promote(
    manager: EntityManager,
    actorId: string,
    target: User,
    adminGrantSig: string,
    keyShares: KeyShareDto[],
  ): Promise<void> {
    if (target.status !== "active") throw new ConflictException("가입을 마친 사람만 관리자로 올릴 수 있어요.");
    if (target.role === "admin") throw new ConflictException("이미 관리자예요.");
    // 올리는 동안 묶음이 새로 생기거나 열쇠가 바뀌지 않게 묶음 표를 잠근다.
    await manager.query("LOCK TABLE vault_groups IN SHARE ROW EXCLUSIVE MODE");
    const groups = await manager.getRepository(VaultGroup).find();
    const existing = await manager.getRepository(VaultGroupAccess).find({ where: { userId: target.id } });
    const needed = groups.filter(
      (group) => !existing.some((row) => row.groupId === group.id && row.generation === group.generation),
    );
    if (!sameSet(keyShares.map((share) => share.groupId), needed.map((group) => group.id))) {
      throw new ConflictException("묶음 목록이 서버와 달라요. 새로 불러온 뒤 다시 하세요.");
    }
    for (const share of keyShares) {
      const group = needed.find((item) => item.id === share.groupId);
      if (!group || group.generation !== share.generation) {
        throw new ConflictException("묶음 열쇠 세대가 서버와 달라요. 새로 불러온 뒤 다시 하세요.");
      }
      await manager.getRepository(VaultGroupAccess).upsert(
        {
          groupId: share.groupId,
          userId: target.id,
          permission: "edit",
          isMember: existing.some((row) => row.groupId === share.groupId && row.isMember),
          generation: share.generation,
          wrappedKey: share.wrappedKey,
          sharedBy: actorId,
          shareSignature: share.shareSignature,
        },
        ["groupId", "userId"],
      );
    }
    await manager.update(User, { id: target.id }, { role: "admin", adminGrantSig, adminGrantedBy: actorId });
  }
}
