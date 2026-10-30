// LICENSE_KEYS 테이블 한 행을 나타내는 TypeORM 엔티티
import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

// 테이블은 옛 서버가 따옴표 없이 LICENSE_KEYS로 만들어 실제 이름이 소문자 license_keys다.
// search_vector(향후 전문 검색용, 현재 미사용) 컬럼은 DB에 남겨 두고 엔티티에는 넣지 않는다.
// synchronize를 끄고 마이그레이션으로만 스키마를 바꾸므로 이 컬럼이 지워지지 않는다.
@Entity({ name: "license_keys" })
// 삭제되지 않은(isdelete=0) 행 사이에서만 key가 유일하다. 소프트 삭제된 키는 같은 값으로 다시 등록할 수 있다.
@Index("license_keys_key_active_uidx", ["key"], { unique: true, where: '"isdelete" = 0' })
export class LicenseKey {
  @PrimaryGeneratedColumn({ name: "no" })
  no: number;

  @Column({ type: "varchar", length: 100 })
  key: string;

  // 배정된 사용자명. NULL / '사용자없음' / '' 이면 미사용 상태다.
  @Column({ type: "varchar", length: 100, nullable: true, default: "사용자없음" })
  member: string | null;

  // 소프트 삭제 플래그 (0: 정상, 1: 삭제됨)
  @Column({ type: "int", default: 0 })
  isdelete: number;

  // 제품 종류 (Windows / MS_Office / Hancom)
  @Column({ type: "varchar", length: 50, nullable: true })
  category: string | null;

  // 세부 버전명 (예: "Windows 11 Pro")
  @Column({ type: "varchar", length: 50, nullable: true })
  version: string | null;
}
