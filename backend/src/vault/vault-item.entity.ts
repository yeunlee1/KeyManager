// vault_items 표 한 행(금고 항목)을 나타내는 TypeORM 엔티티. 요약·비밀·항목 열쇠는 모두 브라우저가 잠근 암호문이다.
import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm";

@Entity({ name: "vault_items" })
export class VaultItem {
  @PrimaryColumn("uuid")
  id: string;

  // 묶음 항목이면 group_id, 개인 항목이면 owner_user_id 하나만 있다.
  @Column({ name: "group_id", type: "uuid", nullable: true })
  groupId: string | null;

  @Column({ name: "owner_user_id", type: "uuid", nullable: true })
  ownerUserId: string | null;

  // 항목 열쇠를 잠근 묶음 열쇠의 세대. 개인 항목은 NULL.
  @Column({ name: "key_generation", type: "int", nullable: true })
  keyGeneration: number | null;

  @Column({ name: "item_key_enc", type: "text" })
  itemKeyEnc: string;

  @Column({ name: "summary_enc", type: "text" })
  summaryEnc: string;

  // 비밀 덩어리. 목록 응답에는 넣지 않고 비밀 제공 요청으로만 내보낸다.
  @Column({ name: "secret_enc", type: "text", select: false })
  secretEnc: string;

  @Column({ type: "int", default: 1 })
  revision: number;

  @Column({ name: "needs_rotation", type: "boolean", default: false })
  needsRotation: boolean;

  @Column({ name: "created_by", type: "uuid", nullable: true })
  createdBy: string | null;

  @Column({ name: "updated_by", type: "uuid", nullable: true })
  updatedBy: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
