// API 서버 진입점. Nest 앱을 만들고(이때 DB 연결과 마이그레이션까지 끝난다) 전역 설정 뒤 포트를 연다
import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module.js";
import { configureApp } from "./app.setup.js";
import type { AppEnv } from "./config/env.validation.js";
import { readAppEnv } from "./config/read-app-env.js";

const logger = new Logger("Bootstrap");

async function bootstrap(): Promise<void> {
  // abortOnError를 끄면 초기화 실패가 process.abort() 대신 예외로 올라와 아래 catch에서 이유를 남기고 끝난다.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { abortOnError: false });
  const env = readAppEnv(app.get<ConfigService<AppEnv, true>>(ConfigService));
  configureApp(app, env);
  await app.listen(env.PORT);
  logger.log(`Server is running on http://localhost:${env.PORT}`);
}

// 스키마 준비나 DB 연결이 실패한 채로 떠 있으면 이후 요청이 모두 조용히 실패하므로,
// 요청을 받기 전에 실패 이유를 남기고 즉시 종료한다.
bootstrap().catch((error: unknown) => {
  logger.error(
    "서버를 시작할 수 없습니다",
    error instanceof Error ? error.stack : String(error),
  );
  process.exit(1);
});
