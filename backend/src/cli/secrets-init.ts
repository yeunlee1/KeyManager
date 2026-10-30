// backend/.env에 APP_SECRET_KEY가 없을 때만 무작위 값을 만들어 넣는 명령(npm run secrets:init). 값은 화면에 찍지 않는다.
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function ensureAppSecretKey(envPath: string): boolean {
  const text = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  if (/^APP_SECRET_KEY=\S+/m.test(text)) return false;
  const separator = text === "" || text.endsWith("\n") ? "" : "\n";
  const block = [
    "",
    "# 서버 비밀 열쇠(2단계 인증 비밀값 암호화, 예비 코드·토큰 HMAC). DB 백업과 따로 보관한다.",
    "# 바꾸거나 잃으면 모든 사람이 2단계 인증을 다시 등록해야 한다.",
    `APP_SECRET_KEY=${randomBytes(32).toString("base64")}`,
    "",
  ].join("\n");
  writeFileSync(envPath, `${text}${separator}${block}`, { mode: 0o600 });
  return true;
}

// node dist/cli/secrets-init.js 로 직접 실행했을 때만 동작한다(시험에서 불러올 때는 실행하지 않음).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const envPath = resolve(process.cwd(), ".env");
  const created = ensureAppSecretKey(envPath);
  console.log(
    created
      ? `${envPath}에 APP_SECRET_KEY를 새로 만들었습니다. 이 파일은 Git에 올리지 마세요.`
      : `${envPath}에 이미 APP_SECRET_KEY가 있어 그대로 두었습니다.`,
  );
}
