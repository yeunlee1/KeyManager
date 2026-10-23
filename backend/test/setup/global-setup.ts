// e2e 시험 전체를 시작하기 전에 시험 DB(keymanager_test)가 없으면 만든다
import pg from "pg";
import { TEST_DB_NAME, loadTestEnv } from "./test-db.js";

export default async function setup(): Promise<void> {
  const env = loadTestEnv();
  // CREATE DATABASE는 대상 DB 안에서 실행할 수 없어 기본 DB(postgres)에 붙어서 만든다.
  const client = new pg.Client({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: "postgres",
  });
  await client.connect();
  try {
    const found = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [TEST_DB_NAME]);
    if (found.rowCount === 0) {
      // DB 이름은 파라미터로 바인딩할 수 없어 고정 상수만 식별자로 넣는다.
      await client.query(`CREATE DATABASE ${TEST_DB_NAME}`);
    }
  } finally {
    await client.end();
  }
}
