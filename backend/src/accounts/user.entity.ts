// users 표 한 행(앱 계정)을 나타내는 TypeORM 엔티티. 비밀 열쇠는 모두 브라우저가 잠근 암호문으로만 있다.
import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm";
import { bigintToNumber } from "../common/bigint.transformer.js";

export type UserRole = "admin" | "member";
export type UserStatus = "pending_totp" | "active" | "disabled";

// 브라우저가 마스터 비밀번호를 바꿀 때 쓰는 Argon2id 설정. 범위 검사는 브라우저와 DTO가 함께 한다.
export interface KdfParams {
  algorithm: "argon2id";
  memoryKiB: number;
  iterations: number;
  parallelism: number;
}

@Entity({ name: "users" })
export class User {
  @PrimaryColumn("uuid")
  id: string;

  // DB 마이그레이션의 UNIQUE와 같게 표시해 둔다(migration:generate가 제약을 지우자고 하지 않게).
  @Column({ name: "login_id", type: "varchar", length: 64, unique: true })
  loginId: string;

  @Column({ type: "varchar", length: 100 })
  name: string;

  @Column({ type: "varchar", length: 16 })
  role: UserRole;

  @Column({ type: "varchar", length: 16 })
  status: UserStatus;

  @Column({ name: "kdf_salt", type: "varchar", length: 64 })
  kdfSalt: string;

  @Column({ name: "kdf_params", type: "jsonb" })
  kdfParams: KdfParams;

  @Column({ name: "auth_hash", type: "varchar", length: 64 })
  authHash: string;

  @Column({ name: "auth_salt", type: "varchar", length: 64 })
  authSalt: string;

  @Column({ name: "recovery_auth_hash", type: "varchar", length: 64 })
  recoveryAuthHash: string;

  @Column({ name: "recovery_auth_salt", type: "varchar", length: 64 })
  recoveryAuthSalt: string;

  @Column({ name: "account_key_master", type: "text" })
  accountKeyMaster: string;

  @Column({ name: "account_key_recovery", type: "text" })
  accountKeyRecovery: string;

  @Column({ name: "enc_public_key", type: "text" })
  encPublicKey: string;

  @Column({ name: "enc_private_key", type: "text" })
  encPrivateKey: string;

  @Column({ name: "sign_public_key", type: "text" })
  signPublicKey: string;

  @Column({ name: "sign_private_key", type: "text" })
  signPrivateKey: string;

  @Column({ name: "totp_secret_enc", type: "text", nullable: true })
  totpSecretEnc: string | null;

  // 등록을 시작했지만 아직 코드로 확인하지 않은 새 비밀값. 확인하면 totpSecretEnc로 옮긴다.
  @Column({ name: "totp_pending_enc", type: "text", nullable: true })
  totpPendingEnc: string | null;

  @Column({ name: "totp_last_step", type: "bigint", nullable: true, transformer: bigintToNumber })
  totpLastStep: number | null;

  // 예비 코드의 HMAC 목록. 쓰면 하나씩 지운다.
  @Column({ name: "backup_codes", type: "jsonb", default: () => "'[]'::jsonb" })
  backupCodes: string[];

  @Column({ name: "failed_attempts", type: "int", default: 0 })
  failedAttempts: number;

  // 비밀번호·2단계 인증·복구 상태가 바뀔 때마다 올라가는 인증 버전. 세션은 만들 때의 값과 같아야 쓸 수 있다.
  @Column({ name: "auth_version", type: "int", default: 1 })
  authVersion: number;

  @Column({ name: "locked_until", type: "timestamptz", nullable: true })
  lockedUntil: Date | null;

  @Column({ name: "last_login_at", type: "timestamptz", nullable: true })
  lastLoginAt: Date | null;

  @Column({ name: "invited_by", type: "uuid", nullable: true })
  invitedBy: string | null;

  // 관리자 승인 서명과 서명한 관리자. 관리자 브라우저는 이 서명이 확인된 관리자의 것일 때만 관리자로 믿는다.
  @Column({ name: "admin_grant_sig", type: "text", nullable: true })
  adminGrantSig: string | null;

  @Column({ name: "admin_granted_by", type: "uuid", nullable: true })
  adminGrantedBy: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
