// 금고의 묶음·구성원·항목·비밀 제공을 처리하는 서비스. 모든 내용은 암호문이고 서버는 권한·세대·개정만 검사한다.
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Request } from "express";
import { DataSource, type EntityManager, In } from "typeorm";
import { User } from "../accounts/user.entity.js";
import { AuditService } from "../audit/audit.service.js";
import type { AuthContext } from "../auth/auth.decorators.js";
import { AuthService } from "../auth/auth.service.js";
import type {
  CreateGroupDto,
  CreateItemDto,
  PutMemberDto,
  RemoveMemberDto,
  RenameGroupDto,
  SecretRequestDto,
  UpdateItemDto,
} from "./dto/vault.dto.js";
import { VaultAccessService } from "./vault-access.service.js";
import { VaultGroupAccess } from "./vault-group-access.entity.js";
import { VaultGroup } from "./vault-group.entity.js";
import { VaultItem } from "./vault-item.entity.js";

@Injectable()
export class VaultService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly access: VaultAccessService,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
  ) {}

  async listGroups(auth: AuthContext) {
    const manager = this.dataSource.manager;
    const mine = await manager.getRepository(VaultGroupAccess).find({ where: { userId: auth.user.id } });
    if (mine.length === 0) return [];
    const groups = await manager.getRepository(VaultGroup).find({ where: { id: In(mine.map((row) => row.groupId)) } });
    const counts: { group_id: string; members: string }[] = await manager.query(
      "SELECT group_id, COUNT(*) FILTER (WHERE is_member) AS members FROM vault_group_access WHERE group_id = ANY($1) GROUP BY group_id",
      [groups.map((group) => group.id)],
    );
    return groups.map((group) => {
      const row = mine.find((item) => item.groupId === group.id) as VaultGroupAccess;
      return {
        id: group.id,
        generation: group.generation,
        nameEnc: group.nameEnc,
        memberCount: Number(counts.find((count) => count.group_id === group.id)?.members ?? 0),
        myAccess: {
          permission: row.permission,
          isMember: row.isMember,
          generation: row.generation,
          wrappedKey: row.wrappedKey,
          sharedBy: row.sharedBy,
          shareSignature: row.shareSignature,
        },
      };
    });
  }

  async createGroup(auth: AuthContext, dto: CreateGroupDto, req: Request) {
    const ids = dto.accesses.map((grant) => grant.userId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException("같은 사람이 두 번 들어 있어요.");
    await this.dataSource.transaction(async (manager) => {
      // 관리자 올리기·비활성화와 겹치지 않게 관리자 작업 잠금을 잡은 뒤, 지금 관리자 전원의 사본이 들어 있는지 본다.
      await this.access.lockAdminOperations(manager, auth);
      const admins = await manager.getRepository(User).find({ where: { role: "admin", status: "active" } });
      if (!admins.every((admin) => ids.includes(admin.id))) {
        throw new ConflictException("관리자 목록이 바뀌었어요. 새로 불러온 뒤 다시 만드세요.");
      }
      const users = await manager.getRepository(User).find({ where: { id: In(ids), status: "active" } });
      if (users.length !== ids.length) throw new ConflictException("열쇠를 받을 수 없는 사람이 들어 있어요.");
      await manager.insert(VaultGroup, { id: dto.id, generation: 1, nameEnc: dto.nameEnc, createdBy: auth.user.id });
      for (const grant of dto.accesses) {
        await manager.insert(VaultGroupAccess, {
          groupId: dto.id,
          userId: grant.userId,
          permission: grant.permission,
          isMember: grant.isMember,
          generation: 1,
          wrappedKey: grant.wrappedKey,
          sharedBy: auth.user.id,
          shareSignature: grant.shareSignature,
        });
      }
      await this.audit.record(
        { actorUserId: auth.user.id, action: "group_created", targetType: "group", targetId: dto.id, groupId: dto.id, request: req },
        manager,
      );
    });
    return { id: dto.id, generation: 1 };
  }

  async renameGroup(auth: AuthContext, groupId: string, dto: RenameGroupDto, req: Request): Promise<void> {
    const result = await this.dataSource
      .getRepository(VaultGroup)
      .update({ id: groupId, generation: dto.generation }, { nameEnc: dto.nameEnc });
    if ((result.affected ?? 0) !== 1) throw new ConflictException("묶음이 없거나 열쇠가 바뀌었어요. 새로 불러온 뒤 다시 하세요.");
    await this.audit.record({ actorUserId: auth.user.id, action: "group_renamed", targetType: "group", targetId: groupId, groupId, request: req });
  }

  async deleteGroup(auth: AuthContext, groupId: string, totpCode: string, req: Request): Promise<void> {
    await this.auth.verifyStepUp(auth.user, totpCode, req);
    await this.dataSource.transaction(async (manager) => {
      const result = await manager.delete(VaultGroup, { id: groupId });
      if ((result.affected ?? 0) !== 1) throw new NotFoundException("묶음이 없어요.");
      await this.audit.record(
        { actorUserId: auth.user.id, action: "group_deleted", targetType: "group", targetId: groupId, groupId, request: req },
        manager,
      );
    });
  }

  async members(groupId: string) {
    const rows = await this.dataSource.getRepository(VaultGroupAccess).find({ where: { groupId } });
    if (rows.length === 0 && !(await this.dataSource.getRepository(VaultGroup).exists({ where: { id: groupId } }))) {
      throw new NotFoundException("묶음이 없어요.");
    }
    const users = rows.length ? await this.dataSource.getRepository(User).find({ where: { id: In(rows.map((r) => r.userId)) } }) : [];
    return rows.map((row) => {
      const user = users.find((item) => item.id === row.userId);
      return {
        userId: row.userId,
        loginId: user?.loginId ?? null,
        name: user?.name ?? null,
        role: user?.role ?? null,
        permission: row.permission,
        isMember: row.isMember,
        generation: row.generation,
        wrappedKey: row.wrappedKey,
        sharedBy: row.sharedBy,
        shareSignature: row.shareSignature,
      };
    });
  }

  async putMember(auth: AuthContext, groupId: string, userId: string, dto: PutMemberDto, req: Request): Promise<void> {
    if (!dto.shareSignature) throw new BadRequestException("권한을 바꾸려면 관리자 서명이 필요해요.");
    const signature = dto.shareSignature;
    await this.dataSource.transaction(async (manager) => {
      await this.access.lockAdminOperations(manager, auth);
      const group = await manager.getRepository(VaultGroup).findOne({ where: { id: groupId }, lock: { mode: "pessimistic_write" } });
      if (!group) throw new NotFoundException("묶음이 없어요.");
      const user = await manager.getRepository(User).findOne({ where: { id: userId } });
      if (!user || user.status !== "active") throw new ConflictException("가입을 마친 사람만 묶음에 넣을 수 있어요.");
      const repo = manager.getRepository(VaultGroupAccess);
      const row = await repo.findOne({ where: { groupId, userId } });
      if (row) {
        // 이미 사본이 있으면(관리자 등) 권한·구성원 여부만 바꾸고, 바뀐 값에 대한 새 서명을 받는다.
        // 서명은 지금 행의 세대·사본에 대해 한 것이어야 한다. 열쇠 교체 전에 만든 옛 서명을 저장하면 명단 확인이 깨진다(짝 검토).
        if (dto.generation !== row.generation || dto.wrappedKey !== row.wrappedKey) {
          throw new ConflictException("열쇠 사본이 그 사이 바뀌었어요. 새로 불러온 뒤 다시 하세요.");
        }
        await repo.update({ groupId, userId }, { permission: dto.permission, isMember: true, sharedBy: auth.user.id, shareSignature: signature });
      } else {
        if (!dto.wrappedKey || dto.generation !== group.generation) {
          throw new ConflictException("새 구성원에게는 지금 세대의 묶음 열쇠 사본이 필요해요. 새로 불러온 뒤 다시 하세요.");
        }
        await repo.insert({
          groupId,
          userId,
          permission: dto.permission,
          isMember: true,
          generation: group.generation,
          wrappedKey: dto.wrappedKey,
          sharedBy: auth.user.id,
          shareSignature: signature,
        });
      }
      await this.audit.record(
        {
          actorUserId: auth.user.id,
          action: row ? "member_updated" : "member_added",
          targetType: "user",
          targetId: userId,
          groupId,
          detail: { permission: dto.permission },
          request: req,
        },
        manager,
      );
    });
  }

  async removeMember(auth: AuthContext, groupId: string, userId: string, dto: RemoveMemberDto & { adminShareSignature?: string; adminShareGeneration?: number; adminShareWrappedKey?: string }, req: Request): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await this.access.lockAdminOperations(manager, auth);
      const user = await manager.getRepository(User).findOne({ where: { id: userId } });
      const row = await this.access.accessOf(manager, groupId, userId);
      if (!row || !row.isMember) throw new NotFoundException("그 묶음의 구성원이 아니에요.");
      if (user?.role === "admin") {
        // 관리자는 구성원에서 빠져도 관리자로서 계속 연다. 구성원 여부가 바뀐 값에 대한 새 서명을 받는다.
        if (!dto.adminShareSignature) throw new BadRequestException("관리자를 구성원에서 뺄 때는 새 서명이 필요해요.");
        if (dto.adminShareGeneration !== row.generation || dto.adminShareWrappedKey !== row.wrappedKey) {
          throw new ConflictException("열쇠 사본이 그 사이 바뀌었어요. 새로 불러온 뒤 다시 하세요.");
        }
        await manager.getRepository(VaultGroupAccess).update(
          { groupId, userId },
          { isMember: false, permission: "edit", sharedBy: auth.user.id, shareSignature: dto.adminShareSignature },
        );
      } else {
        if (!dto.rotation || dto.rotation.groupId !== groupId) {
          throw new BadRequestException("직원을 빼려면 이 묶음의 열쇠 교체 자료가 필요해요.");
        }
        await this.access.applyRotation(manager, auth.user.id, dto.rotation, new Set([userId]));
      }
      await this.audit.record(
        { actorUserId: auth.user.id, action: "member_removed", targetType: "user", targetId: userId, groupId, request: req },
        manager,
      );
    });
  }

  async listItems(auth: AuthContext, req: Request) {
    const manager = this.dataSource.manager;
    const groupIds = (await manager.getRepository(VaultGroupAccess).find({ where: { userId: auth.user.id } })).map((row) => row.groupId);
    const where = [{ ownerUserId: auth.user.id }, ...(groupIds.length ? [{ groupId: In(groupIds) }] : [])];
    const items = await manager.getRepository(VaultItem).find({ where, order: { updatedAt: "DESC" } });
    await this.audit.record({
      actorUserId: auth.user.id,
      action: "vault_synced",
      detail: { items: items.length },
      request: req,
    });
    return items.map((item) => ({
      id: item.id,
      groupId: item.groupId,
      ownerUserId: item.ownerUserId,
      keyGeneration: item.keyGeneration,
      itemKeyEnc: item.itemKeyEnc,
      summaryEnc: item.summaryEnc,
      revision: item.revision,
      needsRotation: item.needsRotation,
      createdBy: item.createdBy,
      updatedBy: item.updatedBy,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    }));
  }

  // 항목 하나를 열 수 있는지 확인한다. 개인 항목은 주인만, 묶음 항목은 사본이 있는 사람만.
  private async authorizeItem(manager: EntityManager, auth: AuthContext, item: VaultItem, need: "view" | "edit"): Promise<boolean> {
    if (item.ownerUserId) {
      if (item.ownerUserId !== auth.user.id) throw new ForbiddenException("이 항목을 열 권한이 없어요.");
      return false;
    }
    const access = await this.access.requireAccess(manager, item.groupId as string, auth.user, need);
    return !access.isMember;
  }

  async deliverSecret(auth: AuthContext, itemId: string, dto: SecretRequestDto, req: Request) {
    return this.dataSource.transaction(async (manager) => {
      const item = await manager
        .getRepository(VaultItem)
        .createQueryBuilder("item")
        .addSelect("item.secretEnc")
        .where("item.id = :id", { id: itemId })
        .getOne();
      if (!item) throw new NotFoundException("항목이 없어요.");
      const asAdmin = await this.authorizeItem(manager, auth, item, "view");
      if (item.revision !== dto.expectedRevision) {
        throw new ConflictException("다른 사람이 먼저 고쳤어요. 새 내용을 불러온 뒤 다시 하세요.");
      }
      // 기록을 남기지 못하면 비밀도 내주지 않도록 같은 트랜잭션에서 먼저 기록한다.
      await this.audit.record(
        {
          actorUserId: auth.user.id,
          action: "secret_delivered",
          targetType: "item",
          targetId: item.id,
          groupId: item.groupId,
          detail: { purpose: dto.purpose, revision: item.revision, asAdmin },
          request: req,
        },
        manager,
      );
      return {
        secretEnc: item.secretEnc,
        revision: item.revision,
        itemKeyEnc: item.itemKeyEnc,
        keyGeneration: item.keyGeneration,
      };
    });
  }

  // 묶음 항목을 쓸 때는 묶음 행을 공유 잠금으로 잡아 열쇠 교체와 겹치지 않게 하고, 지금 세대로 잠근 항목 열쇠만 받는다.
  private async lockGroupGeneration(manager: EntityManager, groupId: string, keyGeneration: number | null | undefined): Promise<void> {
    const group = await manager.getRepository(VaultGroup).findOne({ where: { id: groupId }, lock: { mode: "pessimistic_read" } });
    if (!group) throw new NotFoundException("묶음이 없어요.");
    if (keyGeneration !== group.generation) {
      throw new ConflictException("묶음 열쇠가 바뀌었어요. 새로 불러온 뒤 다시 하세요.");
    }
  }

  async createItem(auth: AuthContext, dto: CreateItemDto, req: Request) {
    await this.dataSource.transaction(async (manager) => {
      if (dto.groupId) {
        await this.access.requireAccess(manager, dto.groupId, auth.user, "edit");
        await this.lockGroupGeneration(manager, dto.groupId, dto.keyGeneration);
      }
      await manager.insert(VaultItem, {
        id: dto.id,
        groupId: dto.groupId,
        ownerUserId: dto.groupId ? null : auth.user.id,
        keyGeneration: dto.groupId ? dto.keyGeneration : null,
        itemKeyEnc: dto.itemKeyEnc,
        summaryEnc: dto.summaryEnc,
        secretEnc: dto.secretEnc,
        revision: 1,
        needsRotation: false,
        createdBy: auth.user.id,
        updatedBy: auth.user.id,
      });
      await this.audit.record(
        { actorUserId: auth.user.id, action: "item_created", targetType: "item", targetId: dto.id, groupId: dto.groupId, request: req },
        manager,
      );
    });
    return { id: dto.id, revision: 1 };
  }

  async updateItem(auth: AuthContext, itemId: string, dto: UpdateItemDto, req: Request) {
    return this.dataSource.transaction(async (manager) => {
      // 열쇠 교체와 같은 순서(묶음 → 항목)로 잠가 교착을 막는다(짝 검토).
      const found = await manager.getRepository(VaultItem).findOne({ where: { id: itemId } });
      if (!found) throw new NotFoundException("항목이 없어요.");
      if (found.groupId) await this.lockGroupGeneration(manager, found.groupId, dto.keyGeneration);
      const item = await manager.getRepository(VaultItem).findOne({ where: { id: itemId }, lock: { mode: "pessimistic_write" } });
      if (!item || item.groupId !== found.groupId) throw new NotFoundException("항목이 없어요.");
      await this.authorizeItem(manager, auth, item, "edit");
      if (item.revision !== dto.expectedRevision) {
        throw new ConflictException("다른 사람이 먼저 고쳤어요. 새 내용을 불러온 뒤 다시 하세요.");
      }
      const revision = item.revision + 1;
      await manager.update(
        VaultItem,
        { id: item.id },
        {
          itemKeyEnc: dto.itemKeyEnc,
          summaryEnc: dto.summaryEnc,
          secretEnc: dto.secretEnc,
          keyGeneration: item.groupId ? dto.keyGeneration : null,
          revision,
          needsRotation: dto.clearRotation ? false : item.needsRotation,
          updatedBy: auth.user.id,
        },
      );
      await this.audit.record(
        { actorUserId: auth.user.id, action: "item_updated", targetType: "item", targetId: item.id, groupId: item.groupId, detail: { revision }, request: req },
        manager,
      );
      return { id: item.id, revision };
    });
  }

  async deleteItem(auth: AuthContext, itemId: string, req: Request): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const item = await manager.getRepository(VaultItem).findOne({ where: { id: itemId }, lock: { mode: "pessimistic_write" } });
      if (!item) throw new NotFoundException("항목이 없어요.");
      await this.authorizeItem(manager, auth, item, "edit");
      await manager.delete(VaultItem, { id: item.id });
      await this.audit.record(
        { actorUserId: auth.user.id, action: "item_deleted", targetType: "item", targetId: item.id, groupId: item.groupId, request: req },
        manager,
      );
    });
  }
}
