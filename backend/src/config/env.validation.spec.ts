// 환경변수 검증(validateEnv)의 기본값·필수값·포트·서버 비밀 열쇠·쿠키 설정 단위 시험
import { describe, expect, it } from "vitest";
import { validateEnv } from "./env.validation.js";

// 시험 전용 값이다. 실제 서버에는 npm run secrets:init이 만든 무작위 값을 쓴다.
const KEY = Buffer.alloc(32, 7).toString("base64");

describe("validateEnv", () => {
  it("DB_PASSWORD가 없거나 비면 안내 문구로 기동을 막는다", () => {
    const message =
      "DB_PASSWORD 환경변수가 설정되지 않았습니다. .env 파일을 확인하세요 (.env.example 참고).";
    expect(() => validateEnv({ APP_SECRET_KEY: KEY })).toThrow(message);
    expect(() => validateEnv({ DB_PASSWORD: "", APP_SECRET_KEY: KEY })).toThrow(message);
  });

  it("값이 없으면 옛 서버와 같은 기본값을 쓴다", () => {
    expect(validateEnv({ DB_PASSWORD: "pw", APP_SECRET_KEY: KEY })).toEqual({
      DB_USER: "postgres",
      DB_HOST: "localhost",
      DB_NAME: "postgres",
      DB_PASSWORD: "pw",
      DB_PORT: 5432,
      PORT: 5000,
      CORS_ORIGIN: "http://localhost:3000",
      APP_SECRET_KEY: KEY,
      COOKIE_SECURE: true,
      AUTH_RATE_LIMIT: 20,
    });
  });

  it("포트 값은 숫자로 바꾸고, 정수가 아니거나 범위를 벗어나면 막는다", () => {
    expect(
      validateEnv({ DB_PASSWORD: "pw", APP_SECRET_KEY: KEY, DB_PORT: "6543", PORT: "8080" }),
    ).toMatchObject({
      DB_PORT: 6543,
      PORT: 8080,
    });
    expect(() => validateEnv({ DB_PASSWORD: "pw", APP_SECRET_KEY: KEY, DB_PORT: "abc" })).toThrow(
      "DB_PORT",
    );
    expect(() => validateEnv({ DB_PASSWORD: "pw", APP_SECRET_KEY: KEY, PORT: "70000" })).toThrow(
      "PORT",
    );
  });

  it("APP_SECRET_KEY가 없으면 만드는 명령을 알려 주며 기동을 막는다", () => {
    expect(() => validateEnv({ DB_PASSWORD: "pw" })).toThrow("npm run secrets:init");
  });

  it("APP_SECRET_KEY가 32바이트 base64가 아니면 막는다", () => {
    for (const bad of ["짧은값", Buffer.alloc(16).toString("base64"), `${KEY}x`, "!".repeat(44)]) {
      expect(() => validateEnv({ DB_PASSWORD: "pw", APP_SECRET_KEY: bad })).toThrow(
        "APP_SECRET_KEY",
      );
    }
  });

  it("AUTH_RATE_LIMIT는 1 이상의 정수만 받는다", () => {
    const base = { DB_PASSWORD: "pw", APP_SECRET_KEY: KEY };
    expect(validateEnv({ ...base, AUTH_RATE_LIMIT: "500" }).AUTH_RATE_LIMIT).toBe(500);
    expect(() => validateEnv({ ...base, AUTH_RATE_LIMIT: "0" })).toThrow("AUTH_RATE_LIMIT");
    expect(() => validateEnv({ ...base, AUTH_RATE_LIMIT: "많이" })).toThrow("AUTH_RATE_LIMIT");
  });

  it("COOKIE_SECURE는 false라고 적었을 때만 끄고, true·false가 아닌 값은 막는다", () => {
    const base = { DB_PASSWORD: "pw", APP_SECRET_KEY: KEY };
    expect(validateEnv({ ...base, COOKIE_SECURE: "false" }).COOKIE_SECURE).toBe(false);
    expect(validateEnv({ ...base, COOKIE_SECURE: "true" }).COOKIE_SECURE).toBe(true);
    expect(() => validateEnv({ ...base, COOKIE_SECURE: "아니요" })).toThrow("COOKIE_SECURE");
  });
});
