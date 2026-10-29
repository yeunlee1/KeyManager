// 잘못된 JSON 본문을 받았을 때 오류 응답에 본문 조각(확인값·토큰 등)을 되돌려 주지 않는지 확인하는 HTTP 시험(DB 없음)
import { Body, Controller, Module, Post } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { configureApp } from "../app.setup.js";
import type { AppEnv } from "../config/env.validation.js";

@Controller("echo")
class EchoController {
  @Post()
  echo(@Body() body: unknown) {
    return { ok: Boolean(body) };
  }
}

@Module({ controllers: [EchoController] })
class EchoModule {}

describe("잘못된 JSON 본문", () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [EchoModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
    configureApp(app, { CORS_ORIGIN: "http://localhost:3000" } as AppEnv);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("400과 고정 문구로 답하고 본문 조각을 싣지 않는다", async () => {
    const marker = "SECRET_MARKER_aGVsbG8td29ybGQtaGVsbG8td29ybGQtMTIzNDU";
    const res = await request(app.getHttpServer())
      .post("/echo")
      .set("Content-Type", "application/json")
      .send(`{"authValue": "${marker}", oops}`)
      .expect(400);
    expect(JSON.stringify(res.body)).not.toContain(marker);
    expect(res.text).not.toContain(marker);
    expect(res.body).toEqual({ error: "요청 형식(JSON)이 올바르지 않아요." });
  });
});
