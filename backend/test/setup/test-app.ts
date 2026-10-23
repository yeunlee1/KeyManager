// e2e 시험용 Nest 앱을 실제 서버와 같은 전역 설정(configureApp)으로 띄우는 도우미
import { Test } from "@nestjs/testing";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "../../src/app.module.js";
import { configureApp } from "../../src/app.setup.js";
import { loadTestEnv } from "./test-db.js";

export async function createTestApp(): Promise<NestExpressApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: ["error"] });
  configureApp(app, loadTestEnv());
  await app.init();
  return app;
}
