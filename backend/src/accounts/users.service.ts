// 사용자 목록·공개키 목록과 관리자의 역할 바꾸기·비활성화·다시 활성화·2단계 인증 초기화를 처리하는 서비스
import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { Request } from "express";
import { DataSource, type EntityManager, Not, type Repository } from "typeorm";
import { AuditService } from "../audit/audit.service.js";
import type { AuthContext } from "../auth/auth.decorators.js";
import { AuthService } from "../auth/auth.service.js";
import { SessionsService } from "../auth/sessions.service.js";
import { VaultAccessService } from "../vault/vault-access.service.js";
import type { DisableUserDto, RoleChangeDto } from "./dto/accounts.dto.js";
import { User } from "./user.entity.js";

@Injectable()
export class UsersService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly auth: AuthService,
    private readonly sessions: SessionsService,
    private readonly access: VaultAccessService,
    private readonly audit: AuditService,
  ) {}

  // 모든 사람이 서명·안전 번호 확인에 쓰는 공개키 목록(비활성 사용자는 뺀다)
  async directory() {
    const rows = await this.users.find({ where: { status: Not("disabled") }, order: { name: "ASC" } });
    return rows.map((user) => ({
      id: user.id,
      loginId: user.loginId,
      name: user.name,
      role: user.role,
      status: user.status,
      encPublicKey: user.encPublicKey,
      signPublicKey: user.signPublicKey,
      adminGrantSig: user.adminGrantSig,
      adminGrantedBy: user.adminGrantedBy,
    }));
  }

  async list() {
    const rows = await this.users.find({ order: { createdAt: "ASC" } });
    return rows.map((user) => ({
      id: user.id,
      loginId: user.loginId,
      name: user.name,
      role: user.role,
      status: user.status,
      totpEnrolled: user.totpSecretEnc !== null,
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      invitedBy: user.invitedBy,
      adminGrantedBy: user.adminGrantedBy,
      createdAt: user.createdAt.toISOString(),
    }));
  }

  private async target(manager: EntityManager, id: string): Promise<User> {
    const user = await manager.getRepository(User).findOne({ where: { id }, lock: { mode: "pessimistic_write" } });
    if (!user) throw new NotFoundException("없는 사용자예요.");
    return user;
  }

  // 마지막 관리자는 내리거나 비활성화할 수 없다(결정 5.1).
  private async assertNotLastAdmin(manager: EntityManager, target: User): Promise<void> {
    if (target.role !== "admin") return;
    const others = await manager
      .getRepository(User)
      .count({ where: { role: "admin", status: "active", id: Not(target.id) } });
    if (others === 0) throw new ConflictException("마지막 관리자는 내리거나 비활성화할 수 없어요. 먼저 다른 관리자를 지정하세요.");
  }

  async changeRole(auth: AuthContext, id: string, dto: RoleChangeDto, req: Request): Promise<void> {
    await this.auth.verifyStepUp(auth.user, dto.totpCode, req);
    await this.dataSource.transaction(async (manager) => {
      const target = await this.target(manager, id);
      if (target.role === dto.role) throw new ConflictException("이미 그 역할이에요.");
      if (dto.role === "admin") {
        if (!dto.promotion) throw new BadRequestException("관리자 승인 서명과 묶음 열쇠 사본이 필요해요.");
        await this.access.promote(manager, auth.user.id, target, dto.promotion.adminGrantSig, dto.promotion.keyShares);
      } else {
        await this.assertNotLastAdmin(manager, target);
        // 구성원이 아니면서 관리자라서 열던 묶음은 열쇠를 바꾸고 그 사본을 지운다.
        await this.access.rotateAllFor(manager, auth.user.id, target.id, dto.rotations ?? [], true);
        await manager.update(User, { id: target.id }, { role: "member", adminGrantSig: null, adminGrantedBy: null });
      }
      await this.audit.record(
        { actorUserId: auth.user.id, action: "role_changed", targetType: "user", targetId: target.id, detail: { role: dto.role }, request: req },
        manager,
      );
    });
  }

  async disable(auth: AuthContext, id: string, dto: DisableUserDto, req: Request): Promise<void> {
    await this.auth.verifyStepUp(auth.user, dto.totpCode, req);
    if (id === auth.user.id) throw new ConflictException("자기 계정은 비활성화할 수 없어요.");
    await this.dataSource.transaction(async (manager) => {
      const target = await this.target(manager, id);
      if (target.status === "disabled") throw new ConflictException("이미 비활성화된 사용자예요.");
      await this.assertNotLastAdmin(manager, target);
      // 그 사람이 열 수 있던 모든 묶음의 열쇠를 바꾸고(빠짐없어야 함), 사본을 지우고, 세션을 모두 끊는다.
      const groups = await this.access.rotateAllFor(manager, auth.user.id, target.id, dto.rotations);
      await manager.update(
        User,
        { id: target.id },
        { status: "disabled", role: "member", adminGrantSig: null, adminGrantedBy: null },
      );
      await this.sessions.bumpAuthVersion(target.id, manager);
      await this.audit.record(
        {
          actorUserId: auth.user.id,
          action: "user_disabled",
          targetType: "user",
          targetId: target.id,
          detail: { rotatedGroups: groups.length },
          request: req,
        },
        manager,
      );
    });
  }

  async enable(auth: AuthContext, id: string, totpCode: string, req: Request): Promise<void> {
    await this.auth.verifyStepUp(auth.user, totpCode, req);
    const result = await this.users.update({ id, status: "disabled" }, { status: "active" });
    if ((result.affected ?? 0) !== 1) throw new ConflictException("비활성화된 사용자만 다시 활성화할 수 있어요.");
    await this.audit.record({ actorUserId: auth.user.id, action: "user_enabled", targetType: "user", targetId: id, request: req });
  }

  // 2단계 인증 초기화는 로그인 수단만 다시 만들게 한다. 금고 열쇠와는 관계없다.
  async resetTotp(auth: AuthContext, id: string, totpCode: string, req: Request): Promise<void> {
    await this.auth.verifyStepUp(auth.user, totpCode, req);
    if (id === auth.user.id) throw new ConflictException("자기 2단계 인증은 예비 코드로 다시 등록하세요.");
    await this.dataSource.transaction(async (manager) => {
      const target = await this.target(manager, id);
      await manager.update(
        User,
        { id: target.id },
        { totpSecretEnc: null, totpPendingEnc: null, totpLastStep: null, backupCodes: [] },
      );
      await this.sessions.bumpAuthVersion(target.id, manager);
      await this.audit.record(
        { actorUserId: auth.user.id, action: "totp_reset", targetType: "user", targetId: target.id, request: req },
        manager,
      );
    });
  }
}
