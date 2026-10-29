// e2e 시험이 쓰는 시험 DB 설정과 DataSource·테이블 비우기 도우미
import dotenv from "dotenv";
import { DataSource, type DataSourceOptions } from "typeorm";
import { type AppEnv, validateEnv } from "../../src/config/env.validation.js";
import { buildDataSourceOptions } from "../../src/database/typeorm.options.js";

export const TEST_DB_NAME = "keymanager_test";

// 시험 전용 서버 비밀 열쇠. 개발용 .env 값과 관계없이 늘 같은 값으로 시험한다.
export const TEST_APP_SECRET_KEY = Buffer.alloc(32, 1).toString("base64");

// 시험 DB 밖을 건드리는 사고를 막는 공통 검사. 연결을 열기 직전과 테이블을 비우기 직전에 부른다.
function assertTestDatabase(name: unknown): void {
  if (name !== TEST_DB_NAME) {
    throw new Error(`e2e 시험은 ${TEST_DB_NAME} DB에서만 실행합니다. (현재: ${String(name)})`);
  }
}

// .env의 접속 정보를 쓰되 DB 이름은 항상 시험 DB로 덮어쓴다.
// 개발·운영 DB를 비우는 사고를 막으려고, 이름이 시험 DB가 아니면 시험을 시작하지 않는다.
export function loadTestEnv(): AppEnv {
  dotenv.config({ quiet: true });
  process.env.DB_NAME = TEST_DB_NAME;
  process.env.APP_SECRET_KEY = TEST_APP_SECRET_KEY;
  // supertest는 http로 요청하므로 Secure 쿠키를 돌려보내지 않는다. 시험에서만 끈다.
  process.env.COOKIE_SECURE = "false";
  const env = validateEnv(process.env);
  assertTestDatabase(env.DB_NAME);
  return env;
}

// 시험에서 바꿔도 안전한 옵션만 받는다. DB 이름·dropSchema·url처럼 대상 DB를 바꾸는 옵션은 받지 않는다.
export interface TestDataSourceOptions {
  migrationsRun?: boolean;
}

export async function createTestDataSource(
  overrides: TestDataSourceOptions = {},
): Promise<DataSource> {
  // 형 변환으로 다른 옵션을 끼워 넣어도 조용히 무시하지 않고 거부한다.
  const unexpected = Object.keys(overrides).filter((key) => key !== "migrationsRun");
  if (unexpected.length > 0) {
    throw new Error(
      `${TEST_DB_NAME} 보호를 위해 createTestDataSource는 migrationsRun만 바꿀 수 있습니다. (받은 옵션: ${unexpected.join(", ")})`,
    );
  }
  const options: DataSourceOptions = {
    ...buildDataSourceOptions(loadTestEnv()),
    ...(overrides.migrationsRun === undefined ? {} : { migrationsRun: overrides.migrationsRun }),
  };
  assertTestDatabase(options.database);
  return new DataSource(options).initialize();
}

export async function truncateLicenseKeys(ds: DataSource): Promise<void> {
  assertTestDatabase(ds.options.database);
  // 설정값만 믿지 않고 실제로 연결된 DB 이름도 확인한 뒤 비운다.
  const rows: { name: string }[] = await ds.query("SELECT current_database() AS name");
  assertTestDatabase(rows[0]?.name);
  await ds.query("TRUNCATE license_keys RESTART IDENTITY");
}
