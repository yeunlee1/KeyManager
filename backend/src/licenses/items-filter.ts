// GET /items의 페이지 파싱과 WHERE 조건 조립을 맡는 순수 함수 모음
// TypeORM·Nest에 의존하지 않아서 DB 없이 단위 시험으로 조건과 바인딩 값을 검증할 수 있다.

export interface ParsedPagination {
  page: number;
  limit: number;
  offset: number;
}

// page/limit 쿼리 파라미터를 안전한 정수로 파싱한다.
// page: 1 이상. limit: 1~100 (한 번에 너무 많은 행을 끌어오지 못하도록 상한을 둔다).
// 잘못된 값은 400으로 막지 않고 기본값으로 바꾼다(옛 Express 서버와 같은 동작).
export function parsePagination(pageRaw?: string, limitRaw?: string): ParsedPagination {
  const page = Math.max(1, parseInt(pageRaw || "", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(limitRaw || "", 10) || 10));
  return { page, limit, offset: (page - 1) * limit };
}

export interface ItemsFilterInput {
  category?: string;
  status?: string;
  searchField?: string;
  searchValue?: string;
}

// QueryBuilder.andWhere(sql, params)에 그대로 넘기는 조건 한 개.
// 값은 항상 :이름 파라미터로 바인딩해 SQL 인젝션을 막는다.
export interface FilterCondition {
  sql: string;
  params: Record<string, string>;
}

// 미사용 기준: member가 NULL / '사용자없음' / '' 중 하나 (통계 집계와 같은 기준)
export function assignedSql(alias: string): string {
  return `(${alias}.member IS NOT NULL AND ${alias}.member <> '사용자없음' AND ${alias}.member <> '')`;
}

export function unassignedSql(alias: string): string {
  return `(${alias}.member IS NULL OR ${alias}.member = '사용자없음' OR ${alias}.member = '')`;
}

// ILIKE의 와일드카드(%, _)와 이스케이프 문자(\)를 사용자가 입력하면 글자 그대로 찾도록 이스케이프한다.
// PostgreSQL LIKE의 기본 이스케이프 문자가 \ 이므로 ESCAPE 절 없이 동작한다.
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

// 소프트 삭제 제외 + 카테고리 + 사용 상태 + 검색어 조건을 차례로 쌓는다.
export function buildItemsConditions(input: ItemsFilterInput, alias: string): FilterCondition[] {
  const { category, status, searchField, searchValue } = input;
  const conditions: FilterCondition[] = [{ sql: `${alias}.isdelete = 0`, params: {} }];

  // "전체" 탭은 프론트에서 category=allassets로 들어온다.
  if (category && category !== "allassets") {
    conditions.push({ sql: `${alias}.category = :category`, params: { category } });
  }

  if (status === "assigned") {
    conditions.push({ sql: assignedSql(alias), params: {} });
  } else if (status === "unassigned") {
    conditions.push({ sql: unassignedSql(alias), params: {} });
  }

  if (searchValue && searchValue.trim() !== "") {
    const search = `%${escapeLikePattern(searchValue)}%`;
    if (searchField === "key") {
      conditions.push({ sql: `${alias}.key ILIKE :search`, params: { search } });
    } else if (searchField === "member") {
      conditions.push({ sql: `${alias}.member ILIKE :search`, params: { search } });
    } else {
      // 전체 검색: key와 member를 같은 파라미터 하나로 OR 검색한다.
      conditions.push({
        sql: `(${alias}.key ILIKE :search OR ${alias}.member ILIKE :search)`,
        params: { search },
      });
    }
  }

  return conditions;
}
