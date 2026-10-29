// ConfigModule이 검증해 둔 값을 AppEnv 객체 하나로 꺼내는 도우미
import type { ConfigService } from "@nestjs/config";
import type { AppEnv } from "./env.validation.js";

export function readAppEnv(config: ConfigService<AppEnv, true>): AppEnv {
  return {
    DB_USER: config.get("DB_USER", { infer: true }),
    DB_HOST: config.get("DB_HOST", { infer: true }),
    DB_NAME: config.get("DB_NAME", { infer: true }),
    DB_PASSWORD: config.get("DB_PASSWORD", { infer: true }),
    DB_PORT: config.get("DB_PORT", { infer: true }),
    PORT: config.get("PORT", { infer: true }),
    CORS_ORIGIN: config.get("CORS_ORIGIN", { infer: true }),
    APP_SECRET_KEY: config.get("APP_SECRET_KEY", { infer: true }),
    COOKIE_SECURE: config.get("COOKIE_SECURE", { infer: true }),
    AUTH_RATE_LIMIT: config.get("AUTH_RATE_LIMIT", { infer: true }),
  };
}
