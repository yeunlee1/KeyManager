// 시험 도우미가 시험 DB(keymanager_test) 밖의 DB를 열거나 비우지 못하는지 확인하는 시험
import { describe, expect, it } from "vitest";
import { DataSource } from "typeorm";
import { TEST_DB_NAME, createTestDataSource, truncateLicenseKeys } from "./setup/test-db.js";

describe("시험 DB 보호 장치", () => {
  it("createTestDataSource는 DB 이름·dropSchema를 덮어쓰는 옵션을 받지 않고 실행 중에도 막는다", async () => {
    // 타입으로 막혀 있어도, 형 변환으로 넘긴 값까지 실행 중에 거부해야 한다.
    const sneaky = { database: "keymanager", dropSchema: true } as unknown as { migrationsRun?: boolean };
    await expect(createTestDataSource(sneaky)).rejects.toThrow(TEST_DB_NAME);
  });

  it("truncateLicenseKeys는 시험 DB가 아닌 연결에서 아무 쿼리도 실행하지 않고 거부한다", async () => {
    const other = new DataSource({ type: "postgres", database: "keymanager" });
    let queried = false;
    other.query = (async () => {
      queried = true;
      return [];
    }) as DataSource["query"];
    await expect(truncateLicenseKeys(other)).rejects.toThrow(TEST_DB_NAME);
    expect(queried).toBe(false);
  });

  it("시험 DB 연결에서는 그대로 비운다", async () => {
    const ds = await createTestDataSource({ migrationsRun: true });
    try {
      await ds.query("INSERT INTO license_keys (key) VALUES ('GUARD-OK')");
      await truncateLicenseKeys(ds);
      const rows: { n: number }[] = await ds.query("SELECT COUNT(*)::int AS n FROM license_keys");
      expect(rows[0].n).toBe(0);
    } finally {
      await ds.destroy();
    }
  });
});
