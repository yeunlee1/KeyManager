// 묶음 열쇠 사본의 권한 판단, 열쇠 교체(세대 올리기), 관리자 올리기의 서버 쪽 규칙. 서버는 열쇠를 풀지 못하고 목록·세대가 빠짐없는지만 확인한다.
import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { type EntityManager, In } from "typeorm";
import { User } from "../accounts/user.entity.js";
import type { AuthContext } from "../auth/auth.decorators.js";
import { Session } from "../auth/session.entity.js";
import type { KeyShareDto } from "../accounts/dto/accounts.dto.js";
import type { RotationDto } from "./dto/vault.dto.js";
import { VaultGroupAccess } from "./vault-group-access.entity.js";
import { VaultGroup } from "./vault-group.entity.js";
import { VaultItem } from "./vault-item.entity.js";

// 관리자 작업을 한 번에 하나씩 처리하는 트랜잭션 잠금 번호(pg_advisory_xact_lock)
export const ADMIN_OPERATIONS_LOCK = 4_242_001;
// 관리자 작업 트랜잭션에서 잠금 하나를 기다리는 최대 시간
export const ADMIN_LOCK_WAIT_MS = 5_000;

const LIST_CHANGED = "열쇠를 받을 사람이나 항목 목록이 서버와 달라요. 새로 불러온 뒤 다시 하세요.";

function sameSet(a: Iterable<string>, b: Iterable<string>): boolean {
  const left = new Set(a);
  const right = new Set(b);
  return left.size === right.size && [...left].every((value) => right.has(value));
}

@Injectable()
export class VaultAccessService {
  // 관리자 작업(역할 바꾸기·비활성화·묶음 만들기·구성원 추가·빼기·관리자 올리기)은 이 잠금으로 한 번에 하나씩 처리한다.
  // 드문 작업이라 차례로 처리해도 느리지 않고, 서로 다른 행 잠금이 엇갈려 생기는 교착·빠짐(짝 검토)이 없어진다.
  // 같은 트랜잭션에서 다시 잡아도 된다(재진입 가능).
  // 잠금을 기다리는 사이 다른 관리자가 이 사람을 내리거나 비활성화했거나 세션이 끝났을 수 있으니, 잡은 뒤 다시 확인한다(짝 재확인).
  async lockAdminOperations(manager: EntityManager, auth: AuthContext): Promise<void> {
    await this.holdAdminLock(manager);
    const actor = await manager.getRepository(User).findOne({ where: { id: auth.user.id } });
    const session = await manager.getRepository(Session).findOne({ where: { id: auth.session.id } });
    const sessionAlive =
      !!session && !session.revokedAt && session.expiresAt.getTime() > Date.now() && session.authVersion === actor?.authVersion;
    if (!actor || actor.role !== "admin" || actor.status !== "active" || actor.authVersion !== auth.session.authVersion || !sessionAlive) {
      throw new ForbiddenException("관리자 권한이나 로그인 상태가 바뀌었어요. 다시 로그인한 뒤 하세요.");
    }
  }

  // 요청한 사람을 확인하지 않고 잠금만 잡는다. 이미 확인한 트랜잭션 안에서 다시 잡거나, 로그인 없는 초대 수락에서 쓴다.
  // 이 트랜잭션의 잠금 대기마다 상한을 둔다(관리자 잠금과 그 뒤 행 잠금 각각). 넘으면 전역 필터가 409로 답한다(짝 재확인).
  // 응답을 포기한 요청이 한참 뒤에 처리되는 일을 줄이려는 것이지, 요청 전체 시간을 보장하지는 않는다.
  async holdAdminLock(manager: EntityManager): Promise<void> {
    await manager.query(`SET LOCAL lock_timeout = '${ADMIN_LOCK_WAIT_MS}ms'`);
    await manager.query("SELECT pg_advisory_xact_lock($1)", [ADMIN_OPERATIONS_LOCK]);
  }

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
    await this.holdAdminLock(manager);
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
    const items = await manager.getRepository(VaultItem).find({ where: { groupId: group.id }, select: { id: true, revision: true } });
    if (!sameSet(rotation.itemKeys.map((k) => k.itemId), items.map((item) => item.id))) {
      throw new ConflictException(LIST_CHANGED);
    }
    // 브라우저가 다시 잠근 항목 열쇠가 지금 개정의 것일 때만 받는다. 그 사이 고쳐진 항목을 옛 열쇠로 덮으면 영영 못 연다.
    for (const key of rotation.itemKeys) {
      if (items.find((item) => item.id === key.itemId)?.revision !== key.revision) {
        throw new ConflictException("그 사이 고쳐진 항목이 있어요. 새로 불러온 뒤 다시 하세요.");
      }
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
    // 올리는 동안 묶음이 새로 생기거나 열쇠가 바뀌지 않게 관리자 작업 잠금을 잡는다.
    await this.holdAdminLock(manager);
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
