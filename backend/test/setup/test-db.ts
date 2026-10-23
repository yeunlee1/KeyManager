// e2e 시험이 쓰는 시험 DB 설정과 DataSource·테이블 비우기 도우미
import dotenv from "dotenv";
import { DataSource, type DataSourceOptions } from "typeorm";
import { type AppEnv, validateEnv } from "../../src/config/env.validation.js";
import { buildDataSourceOptions } from "../../src/database/typeorm.options.js";

export const TEST_DB_NAME = "keymanager_test";

// .env의 접속 정보를 쓰되 DB 이름은 항상 시험 DB로 덮어쓴다.
// 개발·운영 DB를 비우는 사고를 막으려고, 이름이 시험 DB가 아니면 시험을 시작하지 않는다.
export function loadTestEnv(): AppEnv {
  dotenv.config({ quiet: true });
  process.env.DB_NAME = TEST_DB_NAME;
  const env = validateEnv(process.env);
  if (env.DB_NAME !== TEST_DB_NAME) {
    throw new Error(`e2e 시험은 ${TEST_DB_NAME} DB에서만 실행합니다. (현재: ${env.DB_NAME})`);
  }
  return env;
}

export async function createTestDataSource(
  overrides: Partial<DataSourceOptions> = {},
): Promise<DataSource> {
  const options = { ...buildDataSourceOptions(loadTestEnv()), ...overrides } as DataSourceOptions;
  return new DataSource(options).initialize();
}

export async function truncateLicenseKeys(ds: DataSource): Promise<void> {
  await ds.query("TRUNCATE license_keys RESTART IDENTITY");
}
