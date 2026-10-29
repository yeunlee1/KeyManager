// /items 라이선스 API가 옛 Express 서버와 같은 계약(상태 코드·응답·한국어 오류 문구)을 지키는지 확인하는 e2e 시험
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { DataSource } from "typeorm";
import { LicenseKey } from "../src/licenses/license-key.entity.js";
import { LICENSE_MESSAGES as MSG } from "../src/licenses/license-messages.js";
import { createTestApp } from "./setup/test-app.js";
import { truncateLicenseKeys } from "./setup/test-db.js";
import { type Client, quickSession } from "./setup/vault-fixtures.js";

const VALID = { key: "AAAAA-BBBBB-CCCCC", category: "Windows", version: "Windows 11 Pro" };

describe("라이선스 API (/items)", () => {
  let app: NestExpressApplication;
  let ds: DataSource;
  // 라이선스 API는 정상 로그인 세션이 있어야 쓸 수 있다.
  let client: Client;

  // 시험 데이터는 API를 거치지 않고 DB에 바로 넣어, 각 시험이 확인하려는 API 하나에만 의존하게 한다.
  const seed = async (rows: Partial<LicenseKey>[]): Promise<LicenseKey[]> =>
    ds.getRepository(LicenseKey).save(rows.map((row) => ds.getRepository(LicenseKey).create(row)));

  const listKeys = async (query: Record<string, string>): Promise<string[]> => {
    const res = await client.get("/items").query(query).expect(200);
    return res.body.items.map((item: { key: string }) => item.key);
  };

  beforeAll(async () => {
    app = await createTestApp();
    ds = app.get(DataSource);
    client = (await quickSession(app, ds)).client;
  });

  beforeEach(async () => {
    await truncateLicenseKeys(ds);
  });

  afterAll(async () => {
    await app.close();
  });

  describe("POST /items", () => {
    it("등록 성공은 200과 member 기본값 '사용자없음'을 돌려준다", async () => {
      const res = await client.post("/items").send(VALID).expect(200);
      expect(res.body).toMatchObject({
        no: 1,
        key: VALID.key,
        member: "사용자없음",
        category: "Windows",
        version: "Windows 11 Pro",
        isdelete: 0,
        // 옛 서버는 RETURNING *로 search_vector까지 돌려줬다. 응답 형태를 그대로 유지한다.
        search_vector: null,
      });
    });

    it("키 앞뒤 공백은 지워서 저장한다", async () => {
      const res = await client
        .post("/items")
        .send({ ...VALID, key: "  TRIM-ME  " })
        .expect(200);
      expect(res.body.key).toBe("TRIM-ME");
    });

    it("공백뿐인 키·빠진 필드·숫자 키는 400 REQUIRED_CREATE", async () => {
      const bodies = [
        { ...VALID, key: "   " },
        { category: VALID.category, version: VALID.version },
        { key: VALID.key, version: VALID.version },
        { key: VALID.key, category: VALID.category },
        { ...VALID, key: 12345 },
        // 필수값이 빠졌으면 카테고리가 틀려도 필수값 문구가 먼저 나온다(옛 서버와 같은 순서).
        { key: VALID.key, category: "Linux" },
      ];
      for (const body of bodies) {
        const res = await client.post("/items").send(body).expect(400);
        expect(res.body).toEqual({ error: MSG.REQUIRED_CREATE });
      }
    });

    it("없는 카테고리는 400 UNSUPPORTED_CATEGORY, 카테고리에 없는 버전은 400 UNSUPPORTED_VERSION", async () => {
      for (const category of ["Linux", "constructor", "__proto__"]) {
        const res = await client
          .post("/items")
          .send({ ...VALID, category })
          .expect(400);
        expect(res.body).toEqual({ error: MSG.UNSUPPORTED_CATEGORY });
      }
      const res = await client
        .post("/items")
        .send({ ...VALID, version: "Office 2021 Professional Plus" })
        .expect(400);
      expect(res.body).toEqual({ error: MSG.UNSUPPORTED_VERSION });
    });

    it("살아 있는 키와 같으면 400 DUPLICATE_KEY, 삭제된 키와 같으면 등록된다", async () => {
      await client.post("/items").send(VALID).expect(200);
      const dup = await client
        .post("/items")
        .send({ ...VALID, key: ` ${VALID.key} ` })
        .expect(400);
      expect(dup.body).toEqual({ error: MSG.DUPLICATE_KEY });

      await client.delete("/items/1").expect(204);
      const again = await client.post("/items").send(VALID).expect(200);
      expect(again.body.no).toBe(2);
    });

    it("정의되지 않은 필드(isdelete, no, member 등)는 무시된다", async () => {
      const res = await client
        .post("/items")
        .send({ ...VALID, isdelete: 1, no: 999, member: "몰래배정" })
        .expect(200);
      expect(res.body).toMatchObject({ no: 1, isdelete: 0, member: "사용자없음" });
    });
  });

  describe("GET /items", () => {
    it("total과 no 오름차순 항목을 돌려주고 삭제된 행은 빠진다", async () => {
      await seed([
        { key: "K-1", category: "Windows", version: "Windows 11 Pro" },
        { key: "K-2", category: "Hancom", version: "한컴오피스 2024", isdelete: 1 },
        { key: "K-3", category: "MS_Office", version: "Office 2019 Professional Plus" },
      ]);
      const res = await client.get("/items").expect(200);
      expect(res.body.total).toBe(2);
      expect(res.body.items).toEqual([
        { no: 1, key: "K-1", member: "사용자없음", category: "Windows", version: "Windows 11 Pro" },
        {
          no: 3,
          key: "K-3",
          member: "사용자없음",
          category: "MS_Office",
          version: "Office 2019 Professional Plus",
        },
      ]);
    });

    it("카테고리·상태(assigned/unassigned)·검색 필드(key/member/all) 필터가 맞게 걸린다", async () => {
      await seed([
        { key: "WIN-1", member: "홍길동", category: "Windows" },
        { key: "WIN-2", member: null, category: "Windows" },
        { key: "OFF-1", member: "", category: "MS_Office" },
        { key: "HAN-1", member: "사용자없음", category: "Hancom" },
        { key: "HAN-2", member: "김철수", category: "Hancom" },
      ]);
      expect(await listKeys({ category: "Windows" })).toEqual(["WIN-1", "WIN-2"]);
      expect(await listKeys({ category: "allassets" })).toHaveLength(5);
      expect(await listKeys({ status: "assigned" })).toEqual(["WIN-1", "HAN-2"]);
      expect(await listKeys({ status: "unassigned" })).toEqual(["WIN-2", "OFF-1", "HAN-1"]);
      expect(await listKeys({ searchField: "key", searchValue: "han" })).toEqual(["HAN-1", "HAN-2"]);
      expect(await listKeys({ searchField: "member", searchValue: "길동" })).toEqual(["WIN-1"]);
      expect(await listKeys({ searchField: "all", searchValue: "철수" })).toEqual(["HAN-2"]);
      expect(await listKeys({ category: "Hancom", status: "assigned", searchValue: "HAN" })).toEqual([
        "HAN-2",
      ]);
    });

    it("검색어 100%_ 와 \\ 는 글자 그대로 일치하는 키만 찾는다", async () => {
      await seed([{ key: "100%_OFF" }, { key: "100XYOFF" }, { key: "A\\B" }, { key: "AB" }]);
      expect(await listKeys({ searchField: "key", searchValue: "100%_" })).toEqual(["100%_OFF"]);
      expect(await listKeys({ searchField: "key", searchValue: "\\" })).toEqual(["A\\B"]);
    });

    it("page=abc, limit=9999 같은 값도 400 없이 기본값·상한으로 처리한다", async () => {
      await seed(Array.from({ length: 12 }, (_, i) => ({ key: `P-${String(i + 1).padStart(2, "0")}` })));
      const all = await client.get("/items").query({ page: "abc", limit: "9999" }).expect(200);
      expect(all.body.total).toBe(12);
      expect(all.body.items).toHaveLength(12);
      expect(await listKeys({ page: "2", limit: "5" })).toEqual(["P-06", "P-07", "P-08", "P-09", "P-10"]);
      expect(await listKeys({ limit: "-5" })).toEqual(["P-01"]);
      expect(await listKeys({ page: "99" })).toEqual([]);
    });

    it("limit 상한 100은 실제로 걸리고 total은 전체 개수를 돌려준다", async () => {
      await seed(Array.from({ length: 105 }, (_, i) => ({ key: `CAP-${String(i).padStart(3, "0")}` })));
      const res = await client.get("/items").query({ limit: "9999" }).expect(200);
      expect(res.body.items).toHaveLength(100);
      expect(res.body.total).toBe(105);
    });
  });

  describe("GET /items/category-stats", () => {
    it("카테고리별 total·active·available을 숫자로 돌려주고 빈 카테고리는 '미지정'이다", async () => {
      await seed([
        { key: "S-1", member: "홍길동", category: "Windows" },
        { key: "S-2", member: null, category: "Windows" },
        { key: "S-3", member: "삭제됨", category: "Windows", isdelete: 1 },
        { key: "S-4", member: "", category: "Hancom" },
        { key: "S-5", member: "이영희", category: null },
      ]);
      const res = await client.get("/items/category-stats").expect(200);
      // 옛 서버처럼 카테고리 순서는 정하지 않으므로 순서와 상관없이 비교한다.
      expect(res.body).toHaveLength(3);
      expect(res.body).toEqual(
        expect.arrayContaining([
          { category: "Hancom", total: 1, active: 0, available: 1 },
          { category: "Windows", total: 2, active: 1, available: 1 },
          { category: "미지정", total: 1, active: 1, available: 0 },
        ]),
      );
    });
  });

  describe("PUT /items/:no", () => {
    it("키와 사용자 수정 성공은 200과 수정된 행", async () => {
      await seed([{ key: "OLD", category: "Windows", version: "Windows 10 Pro" }]);
      const res = await client
        .put("/items/1")
        .send({ key: " NEW-KEY ", member: "박민수" })
        .expect(200);
      expect(res.body).toMatchObject({
        no: 1,
        key: "NEW-KEY",
        member: "박민수",
        category: "Windows",
        version: "Windows 10 Pro",
        isdelete: 0,
        search_vector: null,
      });
    });

    it("member 없이 보내면 member는 NULL이 되어 미사용으로 집계된다", async () => {
      await seed([{ key: "M-1", member: "홍길동", category: "Windows" }]);
      const res = await client.put("/items/1").send({ key: "M-1" }).expect(200);
      expect(res.body.member).toBeNull();
      const stats = await client.get("/items/category-stats").expect(200);
      expect(stats.body).toEqual([{ category: "Windows", total: 1, active: 0, available: 1 }]);
    });

    it("빈 키는 400 REQUIRED_KEY, 다른 살아 있는 행과 같은 키는 400 DUPLICATE_KEY", async () => {
      await seed([{ key: "A-1" }, { key: "A-2" }, { key: "GONE", isdelete: 1 }]);
      for (const body of [{ key: "   " }, { member: "홍길동" }, { key: 123 }]) {
        const res = await client.put("/items/1").send(body).expect(400);
        expect(res.body).toEqual({ error: MSG.REQUIRED_KEY });
      }
      const dup = await client.put("/items/1").send({ key: "A-2" }).expect(400);
      expect(dup.body).toEqual({ error: MSG.DUPLICATE_KEY });
      // 삭제된 행이 가진 키로는 바꿀 수 있다.
      await client.put("/items/1").send({ key: "GONE" }).expect(200);
    });
  });

  describe("PUT·DELETE 공통", () => {
    it("없거나 삭제된 번호는 404 NOT_FOUND", async () => {
      await seed([{ key: "LIVE" }, { key: "DEAD", isdelete: 1 }]);
      for (const no of ["2", "999"]) {
        const put = await client.put(`/items/${no}`).send({ key: "X" }).expect(404);
        expect(put.body).toEqual({ error: MSG.NOT_FOUND });
        const del = await client.delete(`/items/${no}`).expect(404);
        expect(del.body).toEqual({ error: MSG.NOT_FOUND });
      }
    });

    it("번호가 abc·1.5·1e3·-1·99999999999이면 400 BAD_REQUEST (본문 검사보다 먼저)", async () => {
      await seed(Array.from({ length: 3 }, (_, i) => ({ key: `N-${i}` })));
      for (const no of ["abc", "1.5", "1e3", "-1", "99999999999"]) {
        const put = await client.put(`/items/${no}`).send({ key: "" }).expect(400);
        expect(put.body).toEqual({ error: MSG.BAD_REQUEST });
        const del = await client.delete(`/items/${no}`).expect(400);
        expect(del.body).toEqual({ error: MSG.BAD_REQUEST });
      }
    });
  });

  describe("DELETE /items/:no", () => {
    it("성공은 204이고 이후 목록·통계에서 빠진다", async () => {
      await seed([
        { key: "D-1", category: "Windows" },
        { key: "D-2", category: "Windows" },
      ]);
      const res = await client.delete("/items/1").expect(204);
      expect(res.text).toBe("");
      expect(await listKeys({})).toEqual(["D-2"]);
      const stats = await client.get("/items/category-stats").expect(200);
      expect(stats.body).toEqual([{ category: "Windows", total: 1, active: 0, available: 1 }]);
      const row = await ds.getRepository(LicenseKey).findOneByOrFail({ no: 1 });
      expect(row.isdelete).toBe(1);
    });
  });

  describe("CORS", () => {
    it("허용하지 않은 출처에는 허용 헤더가 없고, http://localhost:3000에는 있다", async () => {
      const denied = await client.get("/items").set("Origin", "http://evil.example");
      expect(denied.headers["access-control-allow-origin"]).toBeUndefined();
      const allowed = await client.get("/items").set("Origin", "http://localhost:3000");
      expect(allowed.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
    });
  });
});
