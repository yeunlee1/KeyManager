// vault_group_access 표 한 행(한 사람이 한 묶음을 여는 권한과 그 사람 몫의 묶음 열쇠 사본)을 나타내는 TypeORM 엔티티
import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm";

export type GroupPermission = "view" | "edit";

@Entity({ name: "vault_group_access" })
export class VaultGroupAccess {
  @PrimaryColumn({ name: "group_id", type: "uuid" })
  groupId: string;

  @PrimaryColumn({ name: "user_id", type: "uuid" })
  userId: string;

  @Column({ type: "varchar", length: 8 })
  permission: GroupPermission;

  // 구성원이면 true. 관리자가 구성원이 아닌 묶음의 열쇠만 받은 경우 false다.
  @Column({ name: "is_member", type: "boolean" })
  isMember: boolean;

  @Column({ type: "int" })
  generation: number;

  // 받는 사람 공개키로 잠근 묶음 열쇠(RSA-OAEP).
  @Column({ name: "wrapped_key", type: "text" })
  wrappedKey: string;

  @Column({ name: "shared_by", type: "uuid", nullable: true })
  sharedBy: string | null;

  // 건넨 관리자의 서명. 받는 사람이 그 관리자를 확인했을 때만 이 열쇠를 쓴다.
  @Column({ name: "share_signature", type: "text" })
  shareSignature: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
