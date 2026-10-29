// .env 값을 검증하고 기본값을 채워 앱 전체가 쓰는 설정 객체(AppEnv)로 만든다

export interface AppEnv {
  DB_USER: string;
  DB_HOST: string;
  DB_NAME: string;
  DB_PASSWORD: string;
  DB_PORT: number;
  PORT: number;
  // 브라우저 요청을 허용할 프론트 주소. 쉼표로 여러 개를 적을 수 있다.
  CORS_ORIGIN: string;
  // 서버 비밀 열쇠(base64 32바이트). 2단계 인증 비밀값 암호화, 예비 코드·세션 토큰 HMAC, 가짜 소금을 이 값에서 나눈다.
  APP_SECRET_KEY: string;
  // 세션 쿠키에 Secure를 붙일지. 기본은 켬이고 COOKIE_SECURE=false일 때만 끈다.
  COOKIE_SECURE: boolean;
  // 인증 요청(설정·로그인·복구·초대 조회·수락)을 IP마다 1분에 몇 번까지 받을지. 기본 20.
  AUTH_RATE_LIMIT: number;
}

function readString(raw: Record<string, unknown>, name: string, fallback: string): string {
  const value = raw[name];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : fallback;
}

function readPort(raw: Record<string, unknown>, name: string, fallback: number): number {
  const value = raw[name];
  if (value === undefined || value === "") return fallback;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${name} 환경변수는 1~65535 사이의 정수여야 합니다. (현재 값: ${String(value)})`);
  }
  return port;
}

function readSecretKey(raw: Record<string, unknown>): string {
  const value = raw.APP_SECRET_KEY;
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(
      "APP_SECRET_KEY 환경변수가 없습니다. backend 폴더에서 npm run secrets:init을 실행해 .env에 만들어 주세요.",
    );
  }
  const key = value.trim();
  // base64를 풀었다가 다시 만들어 같은지 본다. Buffer.from은 틀린 글자를 조용히 버리기 때문이다.
  const bytes = Buffer.from(key, "base64");
  if (bytes.length !== 32 || bytes.toString("base64") !== key) {
    throw new Error("APP_SECRET_KEY는 32바이트를 base64로 적은 값이어야 합니다. npm run secrets:init으로 다시 만드세요.");
  }
  return key;
}

function readPositiveInt(raw: Record<string, unknown>, name: string, fallback: number): number {
  const value = raw[name];
  if (value === undefined || value === "") return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    throw new Error(`${name} 환경변수는 1 이상의 정수여야 합니다. (현재 값: ${String(value)})`);
  }
  return number;
}

function readBoolean(raw: Record<string, unknown>, name: string, fallback: boolean): boolean {
  const value = raw[name];
  if (value === undefined || value === "") return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} 환경변수는 true 또는 false여야 합니다. (현재 값: ${String(value)})`);
}

// ConfigModule.forRoot({ validate })와 TypeORM CLI용 data-source.ts가 함께 쓴다.
// DB_PASSWORD는 약한 기본값으로 조용히 넘어가지 않고, 비어 있으면 기동을 막는다.
export function validateEnv(raw: Record<string, unknown>): AppEnv {
  const password = raw.DB_PASSWORD;
  if (typeof password !== "string" || password === "") {
    throw new Error(
      "DB_PASSWORD 환경변수가 설정되지 않았습니다. .env 파일을 확인하세요 (.env.example 참고).",
    );
  }

  return {
    DB_USER: readString(raw, "DB_USER", "postgres"),
    DB_HOST: readString(raw, "DB_HOST", "localhost"),
    DB_NAME: readString(raw, "DB_NAME", "postgres"),
    DB_PASSWORD: password,
    DB_PORT: readPort(raw, "DB_PORT", 5432),
    PORT: readPort(raw, "PORT", 5000),
    CORS_ORIGIN: readString(raw, "CORS_ORIGIN", "http://localhost:3000"),
    APP_SECRET_KEY: readSecretKey(raw),
    COOKIE_SECURE: readBoolean(raw, "COOKIE_SECURE", true),
    AUTH_RATE_LIMIT: readPositiveInt(raw, "AUTH_RATE_LIMIT", 20),
  };
}
