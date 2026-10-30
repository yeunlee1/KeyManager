// vault_groups 표 한 행(묶음)을 나타내는 TypeORM 엔티티. 이름은 그 세대의 묶음 열쇠로 잠근 암호문이다.
import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm";

@Entity({ name: "vault_groups" })
export class VaultGroup {
  @PrimaryColumn("uuid")
  id: string;

  // 묶음 열쇠 세대. 구성원을 빼면 새 세대로 바꾼다.
  @Column({ type: "int", default: 1 })
  generation: number;

  @Column({ name: "name_enc", type: "text" })
  nameEnc: string;

  @Column({ name: "created_by", type: "uuid", nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
