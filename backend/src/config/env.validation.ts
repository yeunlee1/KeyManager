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
  };
}
