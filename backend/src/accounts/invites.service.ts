// 초대 만들기·조회·수락·취소와, 초대한 관리자의 공개키 확인 완료(관리자 초대면 관리자로 올리기까지)를 처리하는 서비스
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { Request, Response } from "express";
import { DataSource, IsNull, type Repository } from "typeorm";
import { AuditService } from "../audit/audit.service.js";
import type { AuthContext } from "../auth/auth.decorators.js";
import { AuthService } from "../auth/auth.service.js";
import { SessionsService } from "../auth/sessions.service.js";
import { SERVER_KEYS } from "../security/security.module.js";
import type { ServerKeys } from "../security/server-keys.js";
import { hashToken } from "../security/tokens.js";
import { VaultAccessService } from "../vault/vault-access.service.js";
import type { AcceptInviteDto, CreateInviteDto, VerifyInviteDto } from "./dto/accounts.dto.js";
import { Invite } from "./invite.entity.js";
import { TrustRecord } from "./trust-record.entity.js";
import { User } from "./user.entity.js";

const INVITE_TTL_MS = 72 * 60 * 60_000;
const NOT_FOUND = "초대 링크가 없거나, 이미 쓰였거나, 만료됐어요. 관리자에게 새 링크를 받으세요.";

function inviteStatus(invite: Invite): "pending" | "accepted" | "verified" | "revoked" | "expired" {
  if (invite.revokedAt) return "revoked";
  if (invite.verifiedAt) return "verified";
  if (invite.usedAt) return "accepted";
  return invite.expiresAt.getTime() <= Date.now() ? "expired" : "pending";
}

@Injectable()
export class InvitesService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Invite) private readonly invites: Repository<Invite>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly auth: AuthService,
    private readonly sessions: SessionsService,
    private readonly access: VaultAccessService,
    private readonly audit: AuditService,
    @Inject(SERVER_KEYS) private readonly keys: ServerKeys,
  ) {}

  async create(auth: AuthContext, dto: CreateInviteDto, req: Request) {
    await this.auth.verifyStepUp(auth.user, dto.totpCode, req);
    const expiresAt = new Date(dto.expiresAt);
    const now = Date.now();
    // 브라우저가 정한 만료 시각을 그대로 저장하되, 지금부터 72시간(시계 차이 5분 허용) 안이어야 한다.
    if (expiresAt.getTime() <= now || expiresAt.getTime() > now + INVITE_TTL_MS + 5 * 60_000) {
      throw new ConflictException("초대 만료 시각이 올바르지 않아요. 화면을 새로 고친 뒤 다시 만드세요.");
    }
    if (await this.users.exists({ where: { loginId: dto.loginId } })) {
      throw new ConflictException("이미 같은 아이디의 사용자가 있어요.");
    }
    await this.dataSource.transaction(async (manager) => {
      const pending = await manager.getRepository(Invite).find({
        where: { loginId: dto.loginId, usedAt: IsNull(), revokedAt: IsNull() },
      });
      if (pending.some((invite) => invite.expiresAt.getTime() > Date.now())) {
        throw new ConflictException("같은 아이디로 아직 쓰지 않은 초대가 있어요. 그 초대를 취소한 뒤 다시 만드세요.");
      }
      await manager.insert(Invite, {
        id: dto.id,
        tokenHash: hashToken(this.keys.token, dto.token),
        loginId: dto.loginId,
        name: dto.name,
        role: dto.role,
        createdBy: auth.user.id,
        secretEnc: dto.secretEnc,
        inviterMac: dto.inviterMac,
        expiresAt,
      });
      await this.audit.record(
        {
          actorUserId: auth.user.id,
          action: "invite_created",
          targetType: "invite",
          targetId: dto.id,
          detail: { role: dto.role },
          request: req,
        },
        manager,
      );
    });
    return { id: dto.id, expiresAt: expiresAt.toISOString() };
  }

  async list() {
    const rows = await this.invites.find({ order: { createdAt: "DESC" } });
    return rows.map((invite) => ({
      id: invite.id,
      loginId: invite.loginId,
      name: invite.name,
      role: invite.role,
      createdBy: invite.createdBy,
      expiresAt: invite.expiresAt.toISOString(),
      acceptedUserId: invite.acceptedUserId,
      createdAt: invite.createdAt.toISOString(),
      status: inviteStatus(invite),
    }));
  }

  async revoke(auth: AuthContext, inviteId: string, totpCode: string, req: Request): Promise<void> {
    await this.auth.verifyStepUp(auth.user, totpCode, req);
    const result = await this.invites.update(
      { id: inviteId, usedAt: IsNull(), revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
    if ((result.affected ?? 0) !== 1) throw new ConflictException("이미 쓰였거나 취소된 초대예요.");
    await this.audit.record({ actorUserId: auth.user.id, action: "invite_revoked", targetType: "invite", targetId: inviteId, request: req });
  }

  private async findUsable(token: string, manager = this.dataSource.manager, lock = false): Promise<Invite> {
    const invite = await manager.getRepository(Invite).findOne({
      where: { tokenHash: hashToken(this.keys.token, token) },
      ...(lock ? { lock: { mode: "pessimistic_write" as const } } : {}),
    });
    if (!invite || invite.usedAt || invite.revokedAt || invite.expiresAt.getTime() <= Date.now()) {
      throw new NotFoundException(NOT_FOUND);
    }
    return invite;
  }

  // 초대받은 사람이 링크를 열면 부른다. 관리자 공개키와 초대 MAC을 주어 브라우저가 S로 확인하게 한다.
  async lookup(token: string) {
    const invite = await this.findUsable(token);
    const inviter = await this.users.findOne({ where: { id: invite.createdBy } });
    if (!inviter || inviter.status !== "active") throw new NotFoundException(NOT_FOUND);
    return {
      inviteId: invite.id,
      loginId: invite.loginId,
      name: invite.name,
      role: invite.role,
      expiresAt: invite.expiresAt.toISOString(),
      inviterMac: invite.inviterMac,
      inviter: {
        id: inviter.id,
        name: inviter.name,
        encPublicKey: inviter.encPublicKey,
        signPublicKey: inviter.signPublicKey,
      },
    };
  }

  async accept(dto: AcceptInviteDto, req: Request, res: Response): Promise<{ next: "enroll_totp" }> {
    // 확인값 해시(PBKDF2)는 시간이 걸리므로 행을 잠그기 전에 미리 만든다. 아이디·이름·역할은 초대에 적힌 값만 쓴다.
    const preview = await this.findUsable(dto.token);
    const user = await this.auth.buildUser(dto, {
      loginId: preview.loginId,
      name: preview.name,
      role: "member",
      invitedBy: preview.createdBy,
    });
    await this.dataSource.transaction(async (manager) => {
      const invite = await this.findUsable(dto.token, manager, true);
      if (invite.id !== preview.id) throw new NotFoundException(NOT_FOUND);
      if (await manager.getRepository(User).exists({ where: { loginId: invite.loginId } })) {
        throw new ConflictException("이미 같은 아이디의 사용자가 있어요. 관리자에게 알려 주세요.");
      }
      await manager.insert(User, user);
      await manager.update(Invite, { id: invite.id }, { usedAt: new Date(), acceptedUserId: user.id, acceptMac: dto.acceptMac });
      await manager.insert(TrustRecord, {
        ownerUserId: user.id,
        subjectUserId: invite.createdBy,
        recordEnc: dto.inviterTrustRecordEnc,
      });
      await this.audit.record(
        { actorUserId: user.id, action: "invite_accepted", targetType: "invite", targetId: invite.id, request: req },
        manager,
      );
      await this.sessions.start(user.id, "enroll_totp", req, res, manager, user.authVersion ?? 1);
    });
    return { next: "enroll_totp" };
  }

  // 내가 만든 초대 중 수락했지만 아직 확인하지 않은 것. 브라우저가 S를 풀어 두 MAC을 다시 계산한다.
  async pendingVerification(auth: AuthContext) {
    const rows = await this.invites.find({ where: { createdBy: auth.user.id, verifiedAt: IsNull(), revokedAt: IsNull() } });
    const accepted = rows.filter((invite) => invite.usedAt && invite.acceptedUserId);
    const users = accepted.length
      ? await this.users.findBy(accepted.map((invite) => ({ id: invite.acceptedUserId as string })))
      : [];
    return accepted.flatMap((invite) => {
      const user = users.find((item) => item.id === invite.acceptedUserId);
      if (!user) return [];
      return [
        {
          inviteId: invite.id,
          loginId: invite.loginId,
          name: invite.name,
          role: invite.role,
          expiresAt: invite.expiresAt.toISOString(),
          secretEnc: invite.secretEnc,
          inviterMac: invite.inviterMac,
          acceptMac: invite.acceptMac,
          user: {
            id: user.id,
            loginId: user.loginId,
            status: user.status,
            encPublicKey: user.encPublicKey,
            signPublicKey: user.signPublicKey,
          },
        },
      ];
    });
  }

  async verify(auth: AuthContext, inviteId: string, dto: VerifyInviteDto, req: Request): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const invite = await manager.getRepository(Invite).findOne({ where: { id: inviteId }, lock: { mode: "pessimistic_write" } });
      if (!invite || invite.createdBy !== auth.user.id) throw new ForbiddenException("내가 만든 초대만 확인할 수 있어요.");
      if (!invite.usedAt || !invite.acceptedUserId || invite.revokedAt) throw new ConflictException("아직 수락하지 않은 초대예요.");
      if (invite.verifiedAt) throw new ConflictException("이미 확인한 초대예요.");
      const target = await manager.getRepository(User).findOne({ where: { id: invite.acceptedUserId } });
      if (!target || target.status !== "active") {
        throw new ConflictException("초대받은 사람이 2단계 인증 등록까지 마친 뒤에 확인할 수 있어요.");
      }
      await manager.getRepository(TrustRecord).upsert(
        { ownerUserId: auth.user.id, subjectUserId: target.id, recordEnc: dto.trustRecordEnc },
        ["ownerUserId", "subjectUserId"],
      );
      if (invite.role === "admin") {
        if (!dto.promotion) throw new ConflictException("관리자 초대는 관리자 승인 서명과 묶음 열쇠 사본을 함께 보내야 해요.");
        await this.access.promote(manager, auth.user.id, target, dto.promotion.adminGrantSig, dto.promotion.keyShares);
      }
      await manager.update(Invite, { id: invite.id }, { verifiedAt: new Date() });
      await this.audit.record(
        {
          actorUserId: auth.user.id,
          action: "invite_verified",
          targetType: "user",
          targetId: target.id,
          detail: { promoted: invite.role === "admin" },
          request: req,
        },
        manager,
      );
    });
  }
}
