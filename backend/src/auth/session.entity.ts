// sessions 표 한 행(로그인 세션)을 나타내는 TypeORM 엔티티. 쿠키 토큰은 HMAC만 저장한다.
import { Column, CreateDateColumn, Entity, PrimaryColumn } from "typeorm";

// 정상(full)이 아닌 단계는 2단계 인증·복구 절차에 필요한 요청만 쓸 수 있다.
export type SessionStage = "pending_totp" | "enroll_totp" | "recovery_enroll" | "recovery" | "full";

@Entity({ name: "sessions" })
export class Session {
  @PrimaryColumn("uuid")
  id: string;

  @Column({ name: "token_hash", type: "varchar", length: 64 })
  tokenHash: string;

  @Column({ name: "user_id", type: "uuid" })
  userId: string;

  @Column({ type: "varchar", length: 20 })
  stage: SessionStage;

  @Column({ name: "expires_at", type: "timestamptz" })
  expiresAt: Date;

  @Column({ name: "revoked_at", type: "timestamptz", nullable: true })
  revokedAt: Date | null;

  @Column({ type: "varchar", length: 64, nullable: true })
  ip: string | null;

  @Column({ name: "user_agent", type: "varchar", length: 256, nullable: true })
  userAgent: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
