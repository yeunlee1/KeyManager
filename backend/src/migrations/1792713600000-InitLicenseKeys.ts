// LICENSE_KEYS 테이블과 부분 유니크 인덱스를 만드는 첫 마이그레이션 (옛 initSchema와 같은 내용)
import type { MigrationInterface, QueryRunner } from "typeorm";

// 옛 Express 서버가 이미 만든 DB에도 안전하게 돌도록 모든 단계를 멱등하게 작성했다.
// 기존 DB에서는 테이블과 데이터를 그대로 두고, 옛 컬럼 레벨 UNIQUE 제약만 지운 뒤 인덱스를 맞춘다.
export class InitLicenseKeys1792713600000 implements MigrationInterface {
  name = "InitLicenseKeys1792713600000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS LICENSE_KEYS (
        no SERIAL PRIMARY KEY,
        key VARCHAR(100) NOT NULL,
        member VARCHAR(100) DEFAULT '사용자없음',
        isdelete INT DEFAULT 0,
        CATEGORY VARCHAR(50),
        VERSION VARCHAR(50),
        search_vector tsvector
      )
    `);

    // 과거 버전에서 생성된 컬럼 레벨 UNIQUE(key) 제약이 남아 있으면 지운다.
    // (이 제약이 있으면 소프트 삭제된 키를 다시 등록할 수 없다)
    await queryRunner.query(`
      DO $$
      DECLARE
        con_name text;
      BEGIN
        SELECT conname INTO con_name
        FROM pg_constraint
        WHERE conrelid = 'license_keys'::regclass
          AND contype = 'u';

        IF con_name IS NOT NULL THEN
          EXECUTE format('ALTER TABLE LICENSE_KEYS DROP CONSTRAINT %I', con_name);
        END IF;
      END $$
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS license_keys_key_active_uidx
      ON LICENSE_KEYS (key)
      WHERE isdelete = 0
    `);
  }

  // 되돌릴 때 데이터는 지우지 않고 이 마이그레이션이 더한 인덱스만 지운다.
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS license_keys_key_active_uidx`);
  }
}
