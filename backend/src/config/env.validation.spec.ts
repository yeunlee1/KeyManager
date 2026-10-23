// 환경변수 검증(validateEnv)의 기본값·필수값·포트 검사 단위 시험
import { describe, expect, it } from "vitest";
import { validateEnv } from "./env.validation.js";

describe("validateEnv", () => {
  it("DB_PASSWORD가 없거나 비면 안내 문구로 기동을 막는다", () => {
    const message =
      "DB_PASSWORD 환경변수가 설정되지 않았습니다. .env 파일을 확인하세요 (.env.example 참고).";
    expect(() => validateEnv({})).toThrow(message);
    expect(() => validateEnv({ DB_PASSWORD: "" })).toThrow(message);
  });

  it("값이 없으면 옛 서버와 같은 기본값을 쓴다", () => {
    expect(validateEnv({ DB_PASSWORD: "pw" })).toEqual({
      DB_USER: "postgres",
      DB_HOST: "localhost",
      DB_NAME: "postgres",
      DB_PASSWORD: "pw",
      DB_PORT: 5432,
      PORT: 5000,
      CORS_ORIGIN: "http://localhost:3000",
    });
  });

  it("포트 값은 숫자로 바꾸고, 정수가 아니거나 범위를 벗어나면 막는다", () => {
    expect(validateEnv({ DB_PASSWORD: "pw", DB_PORT: "6543", PORT: "8080" })).toMatchObject({
      DB_PORT: 6543,
      PORT: 8080,
    });
    expect(() => validateEnv({ DB_PASSWORD: "pw", DB_PORT: "abc" })).toThrow("DB_PORT");
    expect(() => validateEnv({ DB_PASSWORD: "pw", PORT: "70000" })).toThrow("PORT");
  });
});
