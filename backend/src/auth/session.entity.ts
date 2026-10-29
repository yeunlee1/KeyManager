// sessions 표 한 행(로그인 세션)을 나타내는 TypeORM 엔티티. 쿠키 토큰은 HMAC만 저장한다.
import { Column, CreateDateColumn, Entity, PrimaryColumn } from "typeorm";

// 정상(full)이 아닌 단계는 2단계 인증·복구 절차에 필요한 요청만 쓸 수 있다.
export type SessionStage = "pending_totp" | "enroll_totp" | "recovery_enroll" | "recovery" | "full";

@Entity({ name: "sessions" })
export class Session {
  @PrimaryColumn("uuid")
  id: string;

  @Column({ name: "token_hash", type: "varchar", length: 64, unique: true })
  tokenHash: string;

  @Column({ name: "user_id", type: "uuid" })
  userId: string;

  // 세션을 만들 때의 사용자 인증 버전. 사용자 쪽 값이 올라가면 이 세션은 더 쓸 수 없다.
  @Column({ name: "auth_version", type: "int" })
  authVersion: number;

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
