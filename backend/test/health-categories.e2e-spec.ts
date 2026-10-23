// 연결 상태 확인(/health), 카테고리 목록(/categories), 공통 보안 헤더·404 응답 e2e 시험
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { DataSource } from "typeorm";
import { VERSION_OPTIONS } from "../src/categories/constants.js";
import { createTestApp } from "./setup/test-app.js";

describe("상태 확인·카테고리 API", () => {
  let app: NestExpressApplication;
  let http: ReturnType<NestExpressApplication["getHttpServer"]>;

  beforeAll(async () => {
    app = await createTestApp();
    http = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  it("health는 DB가 응답하면 200 { status: 'ok' }", async () => {
    const res = await request(http).get("/health").expect(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("health는 DB 쿼리가 실패하면 503 { status: 'error' }", async () => {
    const ds = app.get(DataSource);
    const spy = vi.spyOn(ds, "query").mockRejectedValueOnce(new Error("connection terminated"));
    const res = await request(http).get("/health").expect(503);
    expect(res.body).toEqual({ status: "error" });
    spy.mockRestore();
  });

  it("categories는 Windows·MS_Office·Hancom 세 키와 버전 목록을 그대로 돌려준다", async () => {
    const res = await request(http).get("/categories").expect(200);
    expect(Object.keys(res.body)).toEqual(["Windows", "MS_Office", "Hancom"]);
    expect(res.body).toEqual(VERSION_OPTIONS);
  });

  it("응답에 helmet 보안 헤더가 붙고 X-Powered-By는 숨긴다", async () => {
    const res = await request(http).get("/health");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("없는 주소는 404와 { error } 형태로 답한다", async () => {
    const res = await request(http).get("/nope").expect(404);
    expect(typeof res.body.error).toBe("string");
  });
});
