// 초기 마이그레이션이 새 DB와 옛 Express 서버가 만든 DB 모두에서 안전하게 도는지 확인하는 e2e 시험
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DataSource, QueryFailedError } from "typeorm";
import { InitLicenseKeys1792713600000 } from "../src/migrations/1792713600000-InitLicenseKeys.js";
import { createTestDataSource } from "./setup/test-db.js";

// 옛 서버의 아주 오래된 버전이 만들던 스키마. key에 컬럼 레벨 UNIQUE가 걸려 있다.
const LEGACY_DDL = `
  CREATE TABLE LICENSE_KEYS (
    no SERIAL PRIMARY KEY,
    key VARCHAR(100) NOT NULL UNIQUE,
    member VARCHAR(100) DEFAULT '사용자없음',
    isdelete INT DEFAULT 0,
    CATEGORY VARCHAR(50),
    VERSION VARCHAR(50),
    search_vector tsvector
  )`;

async function activeIndexDefs(ds: DataSource): Promise<string[]> {
  const rows: { indexdef: string }[] = await ds.query(
    "SELECT indexdef FROM pg_indexes WHERE tablename = 'license_keys' AND indexname = 'license_keys_key_active_uidx'",
  );
  return rows.map((r) => r.indexdef);
}

async function uniqueConstraintCount(ds: DataSource): Promise<number> {
  const rows: { count: string }[] = await ds.query(
    "SELECT COUNT(*) AS count FROM pg_constraint WHERE conrelid = 'license_keys'::regclass AND contype = 'u'",
  );
  return Number(rows[0].count);
}

describe("InitLicenseKeys 마이그레이션", () => {
  let ds: DataSource;

  beforeAll(async () => {
    ds = await createTestDataSource({ migrationsRun: false });
  });

  beforeEach(async () => {
    await ds.query(
      `DROP TABLE IF EXISTS audit_events, vault_items, vault_group_access, vault_groups, sessions,
        trust_records, invites, users, license_keys, migrations CASCADE`,
    );
  });

  afterAll(async () => {
    await ds.destroy();
  });

  it("빈 DB에 마이그레이션을 두 번 돌려도 테이블과 부분 유니크 인덱스가 하나씩 생긴다", async () => {
    await ds.runMigrations();
    // 기록 테이블이 없는 기존 DB를 흉내 내려고, 같은 up()을 한 번 더 직접 실행한다.
    const runner = ds.createQueryRunner();
    try {
      await new InitLicenseKeys1792713600000().up(runner);
    } finally {
      await runner.release();
    }

    const defs = await activeIndexDefs(ds);
    expect(defs).toHaveLength(1);
    expect(defs[0]).toContain("WHERE (isdelete = 0)");
    expect(await uniqueConstraintCount(ds)).toBe(0);
  });

  it("legacy-schema: 옛 서버가 만든 테이블에서 데이터는 남고 옛 UNIQUE 제약만 지워진다", async () => {
    await ds.query(LEGACY_DDL);
    await ds.query(
      "INSERT INTO LICENSE_KEYS (key, member, CATEGORY, VERSION) VALUES ('OLD-1', '홍길동', 'Windows', 'Windows 11 Pro'), ('OLD-2', NULL, 'Hancom', '한컴오피스 2024')",
    );
    expect(await uniqueConstraintCount(ds)).toBe(1);

    await ds.runMigrations();

    expect(await uniqueConstraintCount(ds)).toBe(0);
    expect(await activeIndexDefs(ds)).toHaveLength(1);
    const rows: { key: string; member: string | null }[] = await ds.query(
      "SELECT key, member FROM license_keys ORDER BY no",
    );
    expect(rows).toEqual([
      { key: "OLD-1", member: "홍길동" },
      { key: "OLD-2", member: null },
    ]);
    const columns: { column_name: string }[] = await ds.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'license_keys' AND column_name = 'search_vector'",
    );
    expect(columns).toHaveLength(1);
  });

  it("key에 걸린 UNIQUE는 여러 개라도 모두 지우고, 다른 컬럼의 UNIQUE는 그대로 둔다", async () => {
    await ds.query(LEGACY_DDL);
    await ds.query("ALTER TABLE license_keys ADD CONSTRAINT license_keys_key_extra UNIQUE (key)");
    await ds.query("ALTER TABLE license_keys ADD CONSTRAINT license_keys_version_uq UNIQUE (version)");

    await ds.runMigrations();

    const rows: { conname: string }[] = await ds.query(
      "SELECT conname FROM pg_constraint WHERE conrelid = 'license_keys'::regclass AND contype = 'u' ORDER BY conname",
    );
    expect(rows.map((r) => r.conname)).toEqual(["license_keys_version_uq"]);
  });

  it("삭제된 키와 같은 키는 다시 넣을 수 있고, 살아 있는 키와 같은 키는 23505로 막힌다", async () => {
    await ds.runMigrations();
    await ds.query("INSERT INTO license_keys (key) VALUES ('SAME-KEY')");
    await ds.query("UPDATE license_keys SET isdelete = 1 WHERE key = 'SAME-KEY'");
    await ds.query("INSERT INTO license_keys (key) VALUES ('SAME-KEY')");

    const duplicate = ds.query("INSERT INTO license_keys (key) VALUES ('SAME-KEY')");
    await expect(duplicate).rejects.toBeInstanceOf(QueryFailedError);
    await expect(duplicate).rejects.toMatchObject({ driverError: { code: "23505" } });
  });
});
