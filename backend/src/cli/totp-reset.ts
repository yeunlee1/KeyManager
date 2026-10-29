// 서버 운영자가 콘솔에서 2단계 인증을 초기화하는 비상 명령(npm run totp:reset -- <아이디> | --all). 로그인 수단만 초기화하고 금고 열쇠와는 관계없다.
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

export interface TotpResetTarget {
  loginId?: string;
  all?: boolean;
}

// 대상 사용자의 2단계 인증 비밀값·예비 코드를 지우고 인증 버전을 올려 모든 세션을 끊는다. 바뀐 사람 수를 돌려준다.
export async function resetTotp(client: pg.Client, target: TotpResetTarget): Promise<number> {
  if (!target.all && !target.loginId) throw new Error("초기화할 아이디나 --all을 주세요.");
  await client.query("BEGIN");
  try {
    const result = await client.query<{ id: string }>(
      `UPDATE users SET totp_secret_enc = NULL, totp_pending_enc = NULL, totp_last_step = NULL,
         backup_codes = '[]'::jsonb, auth_version = auth_version + 1, updated_at = now()
       WHERE $1::boolean OR login_id = $2
       RETURNING id`,
      [Boolean(target.all), target.loginId?.trim().toLowerCase() ?? null],
    );
    for (const row of result.rows) {
      await client.query(
        `INSERT INTO audit_events (action, target_type, target_id, detail) VALUES ('totp_reset_console', 'user', $1, '{}'::jsonb)`,
        [row.id],
      );
    }
    await client.query("COMMIT");
    return result.rowCount ?? 0;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

// node src/cli/totp-reset.ts 로 직접 실행했을 때만 동작한다(시험에서 불러올 때는 실행하지 않음).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  dotenv.config({ quiet: true });
  const arg = process.argv[2];
  const target: TotpResetTarget = arg === "--all" ? { all: true } : { loginId: arg };
  const client = new pg.Client({
    host: process.env.DB_HOST ?? "localhost",
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USER ?? "postgres",
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME ?? "postgres",
  });
  client
    .connect()
    .then(() => resetTotp(client, target))
    .then((count) => {
      console.log(`${process.env.DB_NAME} DB에서 ${count}명의 2단계 인증을 초기화했습니다. 다음 로그인 때 다시 등록합니다.`);
    })
    .catch((error: Error) => {
      console.error(`2단계 인증 초기화 실패: ${error.message}`);
      process.exitCode = 1;
    })
    .finally(() => client.end());
}
