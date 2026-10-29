// trust_records 표 한 행(내가 확인한 상대 공개키 기록)을 나타내는 TypeORM 엔티티. 내 계정 열쇠로 잠근 암호문만 있다.
import { Column, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm";

@Entity({ name: "trust_records" })
export class TrustRecord {
  @PrimaryColumn({ name: "owner_user_id", type: "uuid" })
  ownerUserId: string;

  @PrimaryColumn({ name: "subject_user_id", type: "uuid" })
  subjectUserId: string;

  @Column({ name: "record_enc", type: "text" })
  recordEnc: string;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
