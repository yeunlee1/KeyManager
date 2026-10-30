// 검증한 설정값(APP_ENV)과 APP_SECRET_KEY에서 나눈 서버 열쇠(SERVER_KEYS)를 앱 전체에 주는 전역 모듈
import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AppEnv } from "../config/env.validation.js";
import { readAppEnv } from "../config/read-app-env.js";
import { deriveServerKeys } from "./server-keys.js";

export const APP_ENV = Symbol("APP_ENV");
export const SERVER_KEYS = Symbol("SERVER_KEYS");

@Global()
@Module({
  providers: [
    {
      provide: APP_ENV,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppEnv, true>) => readAppEnv(config),
    },
    {
      provide: SERVER_KEYS,
      inject: [APP_ENV],
      useFactory: (env: AppEnv) => deriveServerKeys(env.APP_SECRET_KEY),
    },
  ],
  exports: [APP_ENV, SERVER_KEYS],
})
export class SecurityModule {}
