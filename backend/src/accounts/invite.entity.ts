// invites 표 한 행(관리자가 만든 초대)을 나타내는 TypeORM 엔티티. 토큰은 HMAC, 초대 비밀은 관리자 계정 열쇠로 잠근 값만 있다.
import { Column, CreateDateColumn, Entity, PrimaryColumn } from "typeorm";
import type { UserRole } from "./user.entity.js";

@Entity({ name: "invites" })
export class Invite {
  @PrimaryColumn("uuid")
  id: string;

  @Column({ name: "token_hash", type: "varchar", length: 64 })
  tokenHash: string;

  @Column({ name: "login_id", type: "varchar", length: 64 })
  loginId: string;

  @Column({ type: "varchar", length: 100 })
  name: string;

  // 초대할 때 정한 역할. 관리자로 초대해도 계정은 직원으로 만들고, 공개키 확인 뒤 관리자로 올린다.
  @Column({ type: "varchar", length: 16 })
  role: UserRole;

  @Column({ name: "created_by", type: "uuid" })
  createdBy: string;

  @Column({ name: "secret_enc", type: "text" })
  secretEnc: string;

  @Column({ name: "inviter_mac", type: "varchar", length: 64 })
  inviterMac: string;

  @Column({ name: "expires_at", type: "timestamptz" })
  expiresAt: Date;

  @Column({ name: "used_at", type: "timestamptz", nullable: true })
  usedAt: Date | null;

  @Column({ name: "accepted_user_id", type: "uuid", nullable: true })
  acceptedUserId: string | null;

  @Column({ name: "accept_mac", type: "varchar", length: 64, nullable: true })
  acceptMac: string | null;

  @Column({ name: "verified_at", type: "timestamptz", nullable: true })
  verifiedAt: Date | null;

  @Column({ name: "revoked_at", type: "timestamptz", nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
