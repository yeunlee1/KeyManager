// e2e 시험용 Nest 앱을 실제 서버와 같은 전역 설정(configureApp)으로 띄우는 도우미
import { Test, type TestingModuleBuilder } from "@nestjs/testing";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "../../src/app.module.js";
import { configureApp } from "../../src/app.setup.js";
import { loadTestEnv } from "./test-db.js";

// configure로 시계 같은 공급자를 시험용으로 바꿔 끼울 수 있다.
export async function createTestApp(
  configure?: (builder: TestingModuleBuilder) => TestingModuleBuilder,
): Promise<NestExpressApplication> {
  const builder = Test.createTestingModule({ imports: [AppModule] });
  const moduleRef = await (configure ? configure(builder) : builder).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: ["error"] });
  configureApp(app, loadTestEnv());
  await app.init();
  return app;
}
