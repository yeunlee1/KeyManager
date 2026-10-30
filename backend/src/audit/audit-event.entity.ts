// audit_events 표 한 행(열람·변경 기록)을 나타내는 TypeORM 엔티티. 비밀번호·제목·주소는 남기지 않는다.
import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

// 기록의 덧붙임 정보. ID·목적·참거짓 표시 같은 단순 값만 담는다.
export type AuditDetail = Record<string, string | number | boolean | null>;

@Entity({ name: "audit_events" })
export class AuditEvent {
  @PrimaryGeneratedColumn({ type: "bigint" })
  id: string;

  @Column({ type: "timestamptz", default: () => "now()" })
  at: Date;

  @Column({ name: "actor_user_id", type: "uuid", nullable: true })
  actorUserId: string | null;

  @Column({ type: "varchar", length: 40 })
  action: string;

  @Column({ type: "varchar", length: 16, default: "ok" })
  result: string;

  @Column({ name: "target_type", type: "varchar", length: 20, nullable: true })
  targetType: string | null;

  @Column({ name: "target_id", type: "varchar", length: 64, nullable: true })
  targetId: string | null;

  @Column({ name: "group_id", type: "uuid", nullable: true })
  groupId: string | null;

  @Column({ type: "jsonb", default: () => "'{}'::jsonb" })
  detail: AuditDetail;

  @Column({ type: "varchar", length: 64, nullable: true })
  ip: string | null;

  @Column({ name: "user_agent", type: "varchar", length: 256, nullable: true })
  userAgent: string | null;
}
