// e2e 시험 전체를 시작하기 전에 시험 DB(keymanager_test)가 있는지 확인하고, 없을 때만 만든다
import pg from "pg";
import { TEST_DB_NAME, loadTestEnv } from "./test-db.js";

// PostgreSQL이 "DB가 없음"을 알리는 오류 코드
const INVALID_CATALOG_NAME = "3D000";

export default async function setup(): Promise<void> {
  const env = loadTestEnv();
  const connection = { host: env.DB_HOST, port: env.DB_PORT, user: env.DB_USER, password: env.DB_PASSWORD };

  // 평소에는 시험 DB에만 접속해 보고 끝낸다. 다른 DB(postgres 등)에는 접속하지 않는다.
  const probe = new pg.Client({ ...connection, database: TEST_DB_NAME });
  try {
    await probe.connect();
    await probe.end();
    return;
  } catch (error) {
    await probe.end().catch(() => undefined);
    if ((error as { code?: string }).code !== INVALID_CATALOG_NAME) throw error;
  }

  // 시험 DB가 정말 없을 때만, 만들기 위해 기본 DB(postgres)에 붙는다. CREATE DATABASE는 대상 DB 안에서 실행할 수 없다.
  const admin = new pg.Client({ ...connection, database: "postgres" });
  await admin.connect();
  try {
    // DB 이름은 파라미터로 바인딩할 수 없어 고정 상수만 식별자로 넣는다.
    await admin.query(`CREATE DATABASE ${TEST_DB_NAME}`);
  } finally {
    await admin.end();
  }
}
