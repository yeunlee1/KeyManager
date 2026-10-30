// 목록 조회 필터 조립(buildItemsConditions)과 페이지 파싱(parsePagination) 단위 시험
import { describe, expect, it } from "vitest";
import { buildItemsConditions, parsePagination } from "./items-filter.js";

const BASE = { sql: "lk.isdelete = 0", params: {} };

describe("parsePagination", () => {
  it("기본값(1페이지, 10개)을 사용한다", () => {
    expect(parsePagination(undefined, undefined)).toEqual({ page: 1, limit: 10, offset: 0 });
  });

  it("page/limit을 offset으로 정확히 환산한다", () => {
    expect(parsePagination("3", "20")).toEqual({ page: 3, limit: 20, offset: 40 });
  });

  it("page가 1보다 작거나 숫자가 아니면 1로 보정한다", () => {
    expect(parsePagination("0", "10").page).toBe(1);
    expect(parsePagination("-5", "10").page).toBe(1);
    expect(parsePagination("abc", "10").page).toBe(1);
  });

  it("limit은 1~100 사이로 제한되고 잘못된 값은 기본값이 된다", () => {
    // limit=0은 parseInt("0") || 10에서 0이 거짓으로 처리되어 기본값(10)이 된다(옛 서버와 같은 동작).
    expect(parsePagination("1", "0").limit).toBe(10);
    expect(parsePagination("1", "9999").limit).toBe(100);
    expect(parsePagination("1", "abc").limit).toBe(10);
    expect(parsePagination("1", "-5").limit).toBe(1);
  });
});

describe("buildItemsConditions", () => {
  it("필터가 없으면 isdelete = 0 조건만 남는다", () => {
    expect(buildItemsConditions({}, "lk")).toEqual([BASE]);
  });

  it("category='allassets'는 필터를 걸지 않는다", () => {
    expect(buildItemsConditions({ category: "allassets" }, "lk")).toEqual([BASE]);
  });

  it("category 필터는 :category 파라미터로 바인딩된다", () => {
    expect(buildItemsConditions({ category: "Windows" }, "lk")).toEqual([
      BASE,
      { sql: "lk.category = :category", params: { category: "Windows" } },
    ]);
  });

  it("status=assigned/unassigned는 파라미터 없이 조건만 추가한다", () => {
    expect(buildItemsConditions({ status: "assigned" }, "lk")).toEqual([
      BASE,
      {
        sql: "(lk.member IS NOT NULL AND lk.member <> '사용자없음' AND lk.member <> '')",
        params: {},
      },
    ]);
    expect(buildItemsConditions({ status: "unassigned" }, "lk")).toEqual([
      BASE,
      { sql: "(lk.member IS NULL OR lk.member = '사용자없음' OR lk.member = '')", params: {} },
    ]);
  });

  it("그 외 status 값은 필터를 걸지 않는다", () => {
    expect(buildItemsConditions({ status: "all" }, "lk")).toEqual([BASE]);
  });

  it("searchField='key'는 key ILIKE로 검색어를 바인딩한다", () => {
    expect(buildItemsConditions({ searchField: "key", searchValue: "ABC" }, "lk").at(-1)).toEqual({
      sql: "lk.key ILIKE :search",
      params: { search: "%ABC%" },
    });
  });

  it("searchField='member'는 member ILIKE로 검색어를 바인딩한다", () => {
    expect(
      buildItemsConditions({ searchField: "member", searchValue: "홍길동" }, "lk").at(-1),
    ).toEqual({ sql: "lk.member ILIKE :search", params: { search: "%홍길동%" } });
  });

  it("searchField='all'(기본)은 key와 member를 같은 파라미터로 OR 검색한다", () => {
    expect(buildItemsConditions({ searchValue: "ABC" }, "lk").at(-1)).toEqual({
      sql: "(lk.key ILIKE :search OR lk.member ILIKE :search)",
      params: { search: "%ABC%" },
    });
  });

  it("검색어의 %, _, \\ 는 리터럴로 취급되도록 이스케이프된다", () => {
    expect(buildItemsConditions({ searchValue: "100%_off\\now" }, "lk").at(-1)?.params).toEqual({
      search: "%100\\%\\_off\\\\now%",
    });
  });

  it("공백만 있는 검색어는 필터를 걸지 않는다", () => {
    expect(buildItemsConditions({ searchValue: "   " }, "lk")).toEqual([BASE]);
  });

  it("카테고리 + 상태 + 검색어를 함께 걸면 조건이 순서대로 쌓인다", () => {
    const conds = buildItemsConditions(
      { category: "Windows", status: "assigned", searchField: "key", searchValue: "XYZ" },
      "lk",
    );
    expect(conds.map((c) => c.sql)).toEqual([
      "lk.isdelete = 0",
      "lk.category = :category",
      "(lk.member IS NOT NULL AND lk.member <> '사용자없음' AND lk.member <> '')",
      "lk.key ILIKE :search",
    ]);
    expect(Object.assign({}, ...conds.map((c) => c.params))).toEqual({
      category: "Windows",
      search: "%XYZ%",
    });
  });
});
