// 처음 설정·로그인·2단계 인증·비밀번호 바꾸기·복구 절차와, 관리자 작업 전 본인 인증 코드 확인을 처리하는 서비스
import { randomBytes } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  type OnModuleInit,
  UnauthorizedException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { Request, Response } from "express";
import { DataSource, type EntityManager, type Repository } from "typeorm";
import { type KdfParams, User, type UserRole } from "../accounts/user.entity.js";
import { AuditService } from "../audit/audit.service.js";
import { type SecretHash, hashSecret, verifySecret } from "../security/auth-hash.js";
import { createBackupCodes, hashBackupCode } from "../security/backup-codes.js";
import { openSecret, sealSecret } from "../security/secret-box.js";
import { SERVER_KEYS } from "../security/security.module.js";
import type { ServerKeys } from "../security/server-keys.js";
import { createTotpSecret, otpAuthUri, verifyTotp } from "../security/totp.js";
import type { AuthContext } from "./auth.decorators.js";
import type {
  AccountMaterialDto,
  ChangePasswordDto,
  LoginDto,
  RecoverCompleteDto,
  RecoverStartDto,
  SecondFactorDto,
  SetupDto,
} from "./dto/auth.dto.js";
import type { SessionStage } from "./session.entity.js";
import { SessionsService } from "./sessions.service.js";
import { SetupCodeService } from "./setup-code.service.js";

export const TOTP_CLOCK = Symbol("TOTP_CLOCK");
export interface TotpClock {
  now(): number;
}

export const DEFAULT_KDF: KdfParams = { algorithm: "argon2id", memoryKiB: 65536, iterations: 3, parallelism: 4 };
const MAX_FAILURES = 5;
const BAD_LOGIN = "아이디 또는 비밀번호가 맞지 않아요.";
const BAD_RECOVERY = "아이디 또는 복구 키가 맞지 않아요.";
const BAD_CODE = "인증 코드가 맞지 않아요. 인증 앱에 보이는 6자리를 다시 확인하세요.";

const fromB64u = (value: string): Buffer => Buffer.from(value, "base64url");

@Injectable()
export class AuthService implements OnModuleInit {
  // 없는 아이디로 로그인해도 같은 시간만큼 계산하려고 쓰는 가짜 해시(아이디가 있는지 응답 시간으로 알 수 없게)
  private dummyHash: SecretHash;

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly sessions: SessionsService,
    private readonly setupCode: SetupCodeService,
    private readonly audit: AuditService,
    @Inject(SERVER_KEYS) private readonly keys: ServerKeys,
    @Inject(TOTP_CLOCK) private readonly clock: TotpClock,
  ) {}

  async onModuleInit(): Promise<void> {
    this.dummyHash = await hashSecret(randomBytes(32));
  }

  async status(): Promise<{ setupRequired: boolean }> {
    return { setupRequired: (await this.users.count()) === 0 };
  }

  // 가입 자료로 users 행을 만든다. 확인값 해시는 트랜잭션 밖에서 미리 계산한다.
  async buildUser(
    material: AccountMaterialDto,
    profile: { loginId: string; name: string; role: UserRole; invitedBy: string | null },
  ): Promise<User> {
    const auth = await hashSecret(fromB64u(material.authValue));
    const recovery = await hashSecret(fromB64u(material.recoveryAuthValue));
    return this.users.create({
      id: material.id,
      loginId: profile.loginId,
      name: profile.name,
      role: profile.role,
      status: "pending_totp",
      kdfSalt: material.kdfSalt,
      kdfParams: { ...material.kdfParams },
      authHash: auth.hash,
      authSalt: auth.salt,
      recoveryAuthHash: recovery.hash,
      recoveryAuthSalt: recovery.salt,
      accountKeyMaster: material.accountKeyMaster,
      accountKeyRecovery: material.accountKeyRecovery,
      encPublicKey: material.encPublicKey,
      encPrivateKey: material.encPrivateKey,
      signPublicKey: material.signPublicKey,
      signPrivateKey: material.signPrivateKey,
      totpSecretEnc: null,
      totpPendingEnc: null,
      totpLastStep: null,
      backupCodes: [],
      failedAttempts: 0,
      lockedUntil: null,
      lastLoginAt: null,
      invitedBy: profile.invitedBy,
      adminGrantSig: null,
      adminGrantedBy: null,
    });
  }

  async setup(dto: SetupDto, req: Request, res: Response): Promise<{ next: "enroll_totp" }> {
    if (!this.setupCode.matches(dto.setupCode)) {
      throw new ForbiddenException("처음 설정 코드가 맞지 않아요. 서버 콘솔에 찍힌 코드를 확인하세요.");
    }
    const user = await this.buildUser(dto, {
      loginId: dto.loginId,
      name: dto.name,
      role: "admin",
      invitedBy: null,
    });
    user.adminGrantSig = dto.adminGrantSig;
    user.adminGrantedBy = user.id;
    await this.dataSource.transaction(async (manager) => {
      // 두 사람이 동시에 설정해도 한 명만 성공하도록 users 표를 잠근 뒤 0명인지 다시 본다.
      await manager.query("LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE");
      if ((await manager.count(User)) > 0) throw new ConflictException("이미 설정을 마쳤어요. 로그인하세요.");
      await manager.insert(User, user);
      await this.audit.record(
        { actorUserId: user.id, action: "setup_admin_created", targetType: "user", targetId: user.id, request: req },
        manager,
      );
      await this.sessions.start(user.id, "enroll_totp", req, res, manager);
    });
    this.setupCode.consume();
    return { next: "enroll_totp" };
  }

  async prelogin(loginId: string): Promise<{ kdfSalt: string; kdfParams: KdfParams }> {
    const user = await this.users.findOne({ where: { loginId } });
    if (user && user.status !== "disabled") return { kdfSalt: user.kdfSalt, kdfParams: user.kdfParams };
    return { kdfSalt: this.keys.fakeKdfSalt(loginId).toString("base64url"), kdfParams: DEFAULT_KDF };
  }

  async login(dto: LoginDto, req: Request, res: Response): Promise<{ next: "totp" | "enroll_totp" }> {
    const user = await this.users.findOne({ where: { loginId: dto.loginId } });
    if (!user || user.status === "disabled") {
      await verifySecret(fromB64u(dto.authValue), this.dummyHash);
      await this.audit.record({
        action: "login_failed",
        result: "fail",
        detail: { loginId: dto.loginId },
        request: req,
      });
      throw new UnauthorizedException(BAD_LOGIN);
    }
    // 잠긴 계정도 확인 계산을 먼저 해서, 응답 시간으로 계정이 있는지·잠겼는지 알 수 없게 한다.
    const ok = await verifySecret(fromB64u(dto.authValue), { hash: user.authHash, salt: user.authSalt });
    if (this.isLocked(user)) {
      // 맞는 값을 넣은 본인에게만 잠김을 알리고, 틀린 값에는 없는 아이디와 같은 응답을 준다.
      if (ok) throw this.lockedError();
      throw new UnauthorizedException(BAD_LOGIN);
    }
    if (!ok) {
      await this.registerFailure(user, "login_failed", req);
      throw new UnauthorizedException(BAD_LOGIN);
    }
    const enrolled = user.totpSecretEnc !== null;
    await this.sessions.start(user.id, enrolled ? "pending_totp" : "enroll_totp", req, res);
    return { next: enrolled ? "totp" : "enroll_totp" };
  }

  async secondFactor(
    auth: AuthContext,
    dto: SecondFactorDto,
    req: Request,
    res: Response,
  ): Promise<{ next: "done" | "enroll_totp" }> {
    const { user } = auth;
    this.assertNotLocked(user);
    if (dto.code) {
      if (!(await this.acceptTotp(user, dto.code))) {
        await this.registerFailure(user, "totp_failed", req);
        throw new UnauthorizedException(BAD_CODE);
      }
      await this.dataSource.transaction(async (manager) => {
        await manager.update(User, user.id, { failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() });
        await this.sessions.advance(auth.session, "full", req, res, manager);
        await this.audit.record(
          { actorUserId: user.id, action: "login_ok", targetType: "user", targetId: user.id, request: req },
          manager,
        );
      });
      return { next: "done" };
    }
    if (dto.backupCode) {
      if (!(await this.consumeBackupCode(user.id, dto.backupCode))) {
        await this.registerFailure(user, "backup_code_failed", req);
        throw new UnauthorizedException("예비 코드가 맞지 않아요.");
      }
      // 휴대폰을 잃었을 수 있으므로 옛 2단계 인증을 지우고 새로 등록하게 한다. 다른 세션은 모두 무효가 된다.
      await this.dataSource.transaction(async (manager) => {
        await manager.update(User, user.id, {
          totpSecretEnc: null,
          totpPendingEnc: null,
          totpLastStep: null,
          failedAttempts: 0,
          lockedUntil: null,
        });
        await this.sessions.bumpAuthVersion(user.id, manager);
        await this.sessions.advance(auth.session, "enroll_totp", req, res, manager);
        await this.audit.record(
          { actorUserId: user.id, action: "backup_code_used", targetType: "user", targetId: user.id, request: req },
          manager,
        );
      });
      return { next: "enroll_totp" };
    }
    throw new BadRequestException("인증 코드나 예비 코드를 입력하세요.");
  }

  async enrollStart(auth: AuthContext): Promise<{ otpauthUri: string; secret: string }> {
    const secret = createTotpSecret();
    await this.users.update(auth.user.id, {
      totpPendingEnc: sealSecret(this.keys.totp, secret, `totp-pending:${auth.user.id}`),
    });
    return { otpauthUri: otpAuthUri(secret, auth.user.loginId), secret };
  }

  async enrollConfirm(
    auth: AuthContext,
    code: string,
    req: Request,
    res: Response,
  ): Promise<{ backupCodes: string[]; next: "done" | "recovery" }> {
    const { user } = auth;
    this.assertNotLocked(user);
    if (!user.totpPendingEnc) throw new BadRequestException("먼저 2단계 인증 등록을 시작하세요.");
    const secret = openSecret(this.keys.totp, user.totpPendingEnc, `totp-pending:${user.id}`);
    const result = verifyTotp(secret, code, null, this.clock.now());
    if (!result.ok) {
      await this.registerFailure(user, "totp_enroll_failed", req);
      throw new UnauthorizedException(BAD_CODE);
    }
    const codes = createBackupCodes();
    const next: SessionStage = auth.session.stage === "recovery_enroll" ? "recovery" : "full";
    await this.dataSource.transaction(async (manager) => {
      await manager.update(User, user.id, {
        totpSecretEnc: sealSecret(this.keys.totp, secret, `totp:${user.id}`),
        totpPendingEnc: null,
        totpLastStep: result.step,
        backupCodes: codes.map((item) => hashBackupCode(this.keys.backupCode, item)),
        status: user.status === "pending_totp" ? "active" : user.status,
        failedAttempts: 0,
        lockedUntil: null,
        ...(next === "full" ? { lastLoginAt: new Date() } : {}),
      });
      // 등록을 마치면 등록 전에 만든 다른 세션(다른 창의 등록 단계 세션 등)을 모두 무효로 한다.
      await this.sessions.bumpAuthVersion(user.id, manager);
      await this.sessions.advance(auth.session, next, req, res, manager);
      await this.audit.record(
        { actorUserId: user.id, action: "totp_enrolled", targetType: "user", targetId: user.id, request: req },
        manager,
      );
    });
    return { backupCodes: codes, next: next === "full" ? "done" : "recovery" };
  }

  async logout(auth: AuthContext, req: Request, res: Response): Promise<void> {
    await this.sessions.revoke(auth.session.id);
    this.sessions.clearCookie(res);
    await this.audit.record({ actorUserId: auth.user.id, action: "logout", targetType: "user", targetId: auth.user.id, request: req });
  }

  me(auth: AuthContext) {
    const { user, session } = auth;
    return {
      id: user.id,
      loginId: user.loginId,
      name: user.name,
      role: user.role,
      status: user.status,
      kdfSalt: user.kdfSalt,
      kdfParams: user.kdfParams,
      accountKeyMaster: user.accountKeyMaster,
      encPublicKey: user.encPublicKey,
      encPrivateKey: user.encPrivateKey,
      signPublicKey: user.signPublicKey,
      signPrivateKey: user.signPrivateKey,
      sessionExpiresAt: session.expiresAt,
    };
  }

  async changePassword(auth: AuthContext, dto: ChangePasswordDto, req: Request, res: Response): Promise<void> {
    const { user } = auth;
    this.assertNotLocked(user);
    const ok = await verifySecret(fromB64u(dto.currentAuthValue), { hash: user.authHash, salt: user.authSalt });
    if (!ok) {
      await this.registerFailure(user, "password_change_failed", req);
      throw new UnauthorizedException("지금 마스터 비밀번호가 맞지 않아요.");
    }
    const next = await hashSecret(fromB64u(dto.authValue));
    await this.dataSource.transaction(async (manager) => {
      await manager.update(User, user.id, {
        kdfSalt: dto.kdfSalt,
        kdfParams: { ...dto.kdfParams },
        authHash: next.hash,
        authSalt: next.salt,
        accountKeyMaster: dto.accountKeyMaster,
        failedAttempts: 0,
      });
      // 다른 곳의 세션은 모두 끊고, 지금 화면은 새 세션으로 이어서 쓴다.
      await this.sessions.bumpAuthVersion(user.id, manager);
      await this.sessions.start(user.id, "full", req, res, manager);
      await this.audit.record(
        { actorUserId: user.id, action: "password_changed", targetType: "user", targetId: user.id, request: req },
        manager,
      );
    });
  }

  async recoverStart(
    dto: RecoverStartDto,
    req: Request,
    res: Response,
  ): Promise<{ next: "recovery" | "enroll_totp" }> {
    const user = await this.users.findOne({ where: { loginId: dto.loginId } });
    if (!user || user.status === "disabled") {
      await verifySecret(fromB64u(dto.recoveryAuthValue), this.dummyHash);
      await this.audit.record({ action: "recovery_failed", result: "fail", detail: { loginId: dto.loginId }, request: req });
      throw new UnauthorizedException(BAD_RECOVERY);
    }
    const ok = await verifySecret(fromB64u(dto.recoveryAuthValue), {
      hash: user.recoveryAuthHash,
      salt: user.recoveryAuthSalt,
    });
    if (this.isLocked(user)) {
      if (ok) throw this.lockedError();
      throw new UnauthorizedException(BAD_RECOVERY);
    }
    if (!ok) {
      await this.registerFailure(user, "recovery_failed", req);
      throw new UnauthorizedException(BAD_RECOVERY);
    }

    let stage: SessionStage;
    if (user.totpSecretEnc === null) {
      // 관리자가 2단계 인증을 초기화해 둔 경우: 새로 등록한 뒤 복구를 마친다.
      stage = "recovery_enroll";
    } else if (dto.code) {
      if (!(await this.acceptTotp(user, dto.code))) {
        await this.registerFailure(user, "totp_failed", req);
        throw new UnauthorizedException(BAD_CODE);
      }
      stage = "recovery";
    } else if (dto.backupCode) {
      if (!(await this.consumeBackupCode(user.id, dto.backupCode))) {
        await this.registerFailure(user, "backup_code_failed", req);
        throw new UnauthorizedException("예비 코드가 맞지 않아요.");
      }
      await this.users.update(user.id, { totpSecretEnc: null, totpPendingEnc: null, totpLastStep: null });
      stage = "recovery_enroll";
    } else {
      throw new BadRequestException("인증 코드나 예비 코드를 입력하세요.");
    }
    // 복구를 시작하면 이 사람의 다른 세션은 모두 무효가 된다(비밀번호를 잃었으니 다른 세션은 남의 것일 수 있다).
    await this.sessions.bumpAuthVersion(user.id);
    await this.sessions.start(user.id, stage, req, res);
    await this.audit.record({
      actorUserId: user.id,
      action: "recovery_started",
      targetType: "user",
      targetId: user.id,
      detail: { withBackupCode: Boolean(dto.backupCode) },
      request: req,
    });
    return { next: stage === "recovery" ? "recovery" : "enroll_totp" };
  }

  recoverMaterial(auth: AuthContext) {
    return { userId: auth.user.id, accountKeyRecovery: auth.user.accountKeyRecovery };
  }

  async recoverComplete(auth: AuthContext, dto: RecoverCompleteDto, req: Request, res: Response): Promise<void> {
    const login = await hashSecret(fromB64u(dto.authValue));
    const recovery = await hashSecret(fromB64u(dto.recoveryAuthValue));
    await this.dataSource.transaction(async (manager) => {
      await manager.update(User, auth.user.id, {
        kdfSalt: dto.kdfSalt,
        kdfParams: { ...dto.kdfParams },
        authHash: login.hash,
        authSalt: login.salt,
        accountKeyMaster: dto.accountKeyMaster,
        recoveryAuthHash: recovery.hash,
        recoveryAuthSalt: recovery.salt,
        accountKeyRecovery: dto.accountKeyRecovery,
        failedAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      });
      await this.sessions.bumpAuthVersion(auth.user.id, manager);
      await this.sessions.start(auth.user.id, "full", req, res, manager);
      await this.audit.record(
        { actorUserId: auth.user.id, action: "recovery_completed", targetType: "user", targetId: auth.user.id, request: req },
        manager,
      );
    });
  }

  // 관리자 작업(초대·역할·비활성화·2단계 인증 초기화·묶음 삭제) 직전에 본인의 인증 코드를 다시 확인한다.
  async verifyStepUp(user: User, code: string | undefined, req: Request): Promise<void> {
    this.assertNotLocked(user);
    if (!code || !(await this.acceptTotp(user, code))) {
      if (code) await this.registerFailure(user, "step_up_failed", req);
      throw new ForbiddenException("본인 확인용 인증 코드가 맞지 않아요.");
    }
  }

  private isLocked(user: User): boolean {
    return user.lockedUntil !== null && user.lockedUntil.getTime() > Date.now();
  }

  private lockedError(): HttpException {
    return new HttpException(
      "틀린 시도가 많아 잠시 잠겼어요. 15분 뒤 다시 시도하세요.",
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  // 이미 비밀번호로 본인임을 확인한 단계(인증 코드·비밀번호 바꾸기·관리자 본인 확인)에서만 쓴다.
  private assertNotLocked(user: User): void {
    if (this.isLocked(user)) throw this.lockedError();
  }

  // 코드가 맞고, 이미 쓴 구간보다 뒤의 구간일 때만 받는다. 같은 코드가 동시에 와도 한 번만 성공하도록 조건부로 갱신한다.
  private async acceptTotp(user: User, code: string): Promise<boolean> {
    if (!user.totpSecretEnc) return false;
    const secret = openSecret(this.keys.totp, user.totpSecretEnc, `totp:${user.id}`);
    const result = verifyTotp(secret, code, user.totpLastStep, this.clock.now());
    if (!result.ok || result.step === null) return false;
    const rows: unknown[] = await this.dataSource.query(
      `WITH updated AS (
         UPDATE users SET totp_last_step = $2
         WHERE id = $1 AND (totp_last_step IS NULL OR totp_last_step < $2)
         RETURNING id
       ) SELECT id FROM updated`,
      [user.id, result.step],
    );
    return rows.length === 1;
  }

  private async consumeBackupCode(userId: string, input: string): Promise<boolean> {
    const hash = hashBackupCode(this.keys.backupCode, input);
    const rows: unknown[] = await this.dataSource.query(
      `WITH updated AS (
         UPDATE users SET backup_codes = backup_codes - $2::text
         WHERE id = $1 AND jsonb_exists(backup_codes, $2::text)
         RETURNING id
       ) SELECT id FROM updated`,
      [userId, hash],
    );
    return rows.length === 1;
  }

  // 틀린 시도를 한 번의 갱신으로 세고, 다섯 번째에 15분 잠근다(동시에 여러 번 틀려도 빠지지 않게).
  private async registerFailure(user: User, action: string, req: Request, manager?: EntityManager): Promise<void> {
    const runner = manager ?? this.dataSource;
    const rows: { locked: boolean }[] = await runner.query(
      `WITH updated AS (
         UPDATE users SET
           failed_attempts = CASE WHEN failed_attempts + 1 >= $2 THEN 0 ELSE failed_attempts + 1 END,
           locked_until = CASE WHEN failed_attempts + 1 >= $2 THEN now() + interval '15 minutes' ELSE locked_until END
         WHERE id = $1
         RETURNING (locked_until IS NOT NULL AND locked_until > now()) AS locked
       ) SELECT locked FROM updated`,
      [user.id, MAX_FAILURES],
    );
    await this.audit.record(
      {
        actorUserId: user.id,
        action,
        result: "fail",
        targetType: "user",
        targetId: user.id,
        detail: rows[0]?.locked ? { locked: true } : {},
        request: req,
      },
      manager,
    );
  }
}
