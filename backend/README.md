# Backend

라이선스 관리 시스템의 REST API 서버. NestJS + TypeScript로 작성되어 있고, TypeORM으로 PostgreSQL을 다룬다.

> **인증 없음(의도된 설계)**: 사내망에서만 쓰는 내부 관리 도구라 로그인/권한 체크가 없다.
> 외부에 노출하는 배포 형태가 아니므로 누락이 아니라 의도적으로 생략한 것이다.

## 기술 스택

- **NestJS 12** — 모듈·컨트롤러·서비스 구조로 API를 나눈다. 내부 HTTP 서버는 Express 5다.
  NestJS 12부터 ESM 전용이라 이 프로젝트도 `"type": "module"`이고, 상대 경로 import에는 `.js`를 붙인다.
- **TypeORM 1.x** — `LicenseKey` 엔티티로 테이블을 다루고, 스키마 변경은 마이그레이션으로 관리한다.
- **pg** — TypeORM이 쓰는 PostgreSQL 드라이버.
- **class-validator / class-transformer** — 요청 본문·쿼리를 DTO로 검증한다.
- **helmet** — 보안 응답 헤더를 붙인다.
- **Vitest** — 단위 시험과 실제 DB를 쓰는 e2e 시험. 데코레이터 메타데이터 때문에 SWC로 변환한다.
- **TypeScript 6.0** — 최신은 7.0이지만 NestJS CLI가 아직 6.0만 지원해서 6.0에 고정했다.

## 폴더 구조

```
backend/
├── src/
│   ├── main.ts                  # 진입점. Nest 앱 생성(DB 연결·마이그레이션) → 전역 설정 → 포트 대기
│   ├── app.module.ts            # 설정·DB·기능 모듈을 묶는 루트 모듈
│   ├── app.setup.ts             # helmet, CORS, 검증 파이프, 예외 필터, 종료 훅 (main과 시험이 같이 씀)
│   ├── data-source.ts           # TypeORM CLI용 DataSource (마이그레이션 실행·생성)
│   ├── config/                  # .env 검증(validateEnv)과 읽기 도우미
│   ├── database/                # 앱·CLI가 함께 쓰는 TypeORM 연결 설정
│   ├── common/                  # 오류 응답을 { error } 형태로 바꾸는 전역 예외 필터
│   ├── health/                  # GET /health
│   ├── categories/              # GET /categories, category/version 허용 목록(constants.ts)
│   ├── licenses/                # /items API: 엔티티, DTO, 서비스, 컨트롤러, 목록 필터 순수 함수
│   └── migrations/              # 스키마 마이그레이션
├── test/                        # e2e 시험과 시험 DB 도우미
├── dist/                        # 빌드 결과물 (git 추적 안 함)
├── vitest.config.ts             # 단위 시험 설정 (src/**/*.spec.ts)
├── vitest.e2e.config.ts         # e2e 시험 설정 (test/**/*.e2e-spec.ts)
└── package.json
```

## 실행 방법

### 사전 요구사항

- **Node.js 22.22.2 이상(22 계열), 24.15.0 이상(24 계열) 또는 26 이상** (홀수 버전 25는 지원하지 않음)
- **PostgreSQL** — https://www.postgresql.org/download/ 에서 설치한다. 설치할 때 정한 비밀번호가 `.env`에 필요하다.

### 1. 환경 변수 설정

`.env.example`을 복사해 `.env`로 저장하고 값을 채운다. `@nestjs/config`가 시작할 때 읽는다.

```bash
cp .env.example .env
```

```
DB_USER=postgres
DB_HOST=localhost
DB_NAME=keymanager
DB_PASSWORD=your_password_here  # ← 변경 필요
DB_PORT=5432
PORT=5000
CORS_ORIGIN=http://localhost:3000
```

- `DB_USER`/`DB_HOST`/`DB_NAME`/`DB_PORT`/`PORT`는 값이 없으면 각각 `postgres`/`localhost`/`postgres`/`5432`/`5000`을 쓴다.
- `DB_PASSWORD`는 약한 기본값으로 조용히 넘어가지 않는다. **값이 없으면 서버가 기동을 거부**한다.
- `CORS_ORIGIN`에 적은 주소에서 온 브라우저 요청만 허용한다(기본 `http://localhost:3000`). 여러 개면 쉼표로 구분한다.
- 같은 이름의 값이 실제 환경변수에도 있으면 그쪽이 `.env`보다 우선한다.

DB 이름(`keymanager`)의 데이터베이스는 미리 만들어 둔다. 테이블과 인덱스는 서버가 시작할 때 마이그레이션이 만든다.

### 2. 설치 및 실행

```bash
npm install

# 개발: 소스를 저장할 때마다 다시 빌드하고 재시작
npm run dev

# 배포/운영: 한 번 빌드한 뒤 빌드본으로 실행
npm run build   # dist/ 생성
npm start       # node dist/main.js
```

`→ http://localhost:5000` (또는 `.env`의 `PORT` 값)

서버는 DB 연결과 마이그레이션을 끝낸 뒤에야 요청을 받기 시작한다. 비밀번호가 비어 있으면 바로,
DB에 붙지 못하면 두 번 다시 시도한 뒤, 요청을 받기 전에 이유를 로그로 남기고 종료한다(종료 코드 1).

### 3. 시험

```bash
npm test          # 단위 시험 (DB 필요 없음)
npm run test:e2e  # 실제 PostgreSQL을 쓰는 e2e 시험
```

e2e 시험은 `.env`의 접속 정보를 쓰되 **DB 이름을 항상 `keymanager_test`로 바꿔서** 실행한다.
`keymanager_test`가 없으면 시험 시작 때 만들고, 시험마다 그 안의 `license_keys` 테이블을 비운다.
DB 이름이 `keymanager_test`가 아니면 시험이 시작되지 않으므로 개발 DB의 데이터는 건드리지 않는다.

## DB 스키마

스키마는 `src/migrations/`의 마이그레이션으로 관리한다. 서버가 시작할 때 아직 실행하지 않은 마이그레이션을
자동으로 실행하고, 실행 기록은 `migrations` 테이블에 남는다. 엔티티와 DB가 어긋나도 테이블을 자동으로 고치는
`synchronize`는 꺼 두었다(엔티티에 없는 `search_vector` 컬럼을 지울 수 있어서).

첫 마이그레이션(`InitLicenseKeys`)이 만드는 스키마는 아래와 같다. 옛 Express 서버가 이미 만든 DB에서도
안전하게 돌도록 모든 단계가 "없으면 만들기"라서, 기존 테이블과 데이터는 그대로 두고 옛 컬럼 레벨 UNIQUE 제약만 지운다.

```sql
CREATE TABLE IF NOT EXISTS LICENSE_KEYS (
  no           SERIAL PRIMARY KEY,
  key          VARCHAR(100) NOT NULL,           -- 라이선스 키 (XXXXX-XXXXX-... 형식)
  member       VARCHAR(100) DEFAULT '사용자없음', -- 배정된 사용자명
  isdelete     INT DEFAULT 0,                   -- 소프트 삭제 플래그 (0: 정상, 1: 삭제)
  CATEGORY     VARCHAR(50),                     -- Windows / MS_Office / Hancom (constants.ts 허용 목록으로 검증)
  VERSION      VARCHAR(50),                     -- 세부 버전명 (constants.ts 허용 목록으로 검증)
  search_vector tsvector                        -- 향후 전문 검색 확장용 (현재 미사용, 엔티티에는 없음)
);

-- 컬럼 레벨 UNIQUE 대신, 삭제되지 않은 행(isdelete = 0) 사이에서만 key 유일성을 강제한다.
-- → 소프트 삭제된 키는 별도 조치 없이 같은 값으로 재등록할 수 있다.
CREATE UNIQUE INDEX IF NOT EXISTS license_keys_key_active_uidx
ON LICENSE_KEYS (key)
WHERE isdelete = 0;
```

### 스키마를 바꿀 때

1. `src/licenses/license-key.entity.ts`를 고친다.
2. `npm run build` 후 `npm run migration:generate -- src/migrations/<이름>`으로 마이그레이션을 만든다.
3. 만들어진 SQL을 검토하고 다시 빌드한다. 다음 기동 때 자동으로 적용된다(`npm run migration:run`으로 먼저 적용할 수도 있다).

### 사용자 배정 상태 기준

| member 값 | 상태 |
|-----------|------|
| NULL | 미사용 |
| `''` (빈 문자열) | 미사용 |
| `'사용자없음'` | 미사용 |
| 그 외 문자열 | 사용 중 |

## API 명세

모든 실패 응답은 `{ "error": "<한국어 문구>" }` 형태다. 예상하지 못한 서버 오류만 내부 내용을 숨기고
500 텍스트 `Server Error`로 답한다(프론트는 이때 상황별 한국어 기본 문구를 보여준다).

### `GET /health`
서버 및 DB 연결 상태 확인. 프론트엔드 상단 배지에서 사용.

```
Response 200: { "status": "ok" }
Response 503: { "status": "error" }
```

---

### `GET /categories`
등록 폼의 category → version 허용 목록(`src/categories/constants.ts`)을 그대로 반환한다.
프론트는 이 값을 별도로 하드코딩하지 않고 그대로 사용한다.

```
Response 200:
{
  "Windows": ["Windows 11 Pro", ...],
  "MS_Office": ["Microsoft 365 Business", ...],
  "Hancom": ["한컴오피스 2024", ...]
}
```

---

### `GET /items`
라이선스 목록 조회 (페이지네이션 + 필터 + 검색). `no` 오름차순.

**Query Parameters**

| 파라미터 | 기본값 | 설명 |
|----------|--------|------|
| `page` | 1 | 페이지 번호. 숫자가 아니거나 1보다 작으면 1 |
| `limit` | 10 | 페이지당 항목 수. 1~100으로 제한, 숫자가 아니면 10 |
| `category` | - | `allassets` 또는 `Windows` / `MS_Office` / `Hancom` |
| `status` | `all` | `assigned`(사용 중) / `unassigned`(미사용) |
| `searchField` | `all` | `key` / `member` / `all` |
| `searchValue` | - | 검색어. `%`, `_`, `\`도 글자 그대로 찾는다 |

```
Response 200: { "items": [{ "no", "key", "member", "category", "version" }, ...], "total": 42 }
```

---

### `GET /items/category-stats`
상단 통계 카드용 카테고리별 집계. 카테고리가 비어 있는 행은 `미지정`으로 묶는다.

```
Response 200:
[
  { "category": "Windows", "total": 10, "active": 7, "available": 3 },
  ...
]
```

---

### `POST /items`
새 라이선스 키 등록. 키 앞뒤 공백은 지운다. 검사 순서는 필수값 → 카테고리 → 버전 → 중복이다.
본문에 다른 필드(`member`, `isdelete` 등)가 있어도 무시한다.

```json
Request Body: { "key": "XXXXX-XXXXX-XXXXX-XXXXX-XXXXX", "category": "Windows", "version": "Windows 11 Pro" }
Response 200: { "no", "key", "member": "사용자없음", "isdelete": 0, "category", "version" }
Response 400: { "error": "키, 카테고리, 버전은 필수 항목입니다." }
Response 400: { "error": "지원하지 않는 카테고리입니다." }
Response 400: { "error": "지원하지 않는 버전입니다." }
Response 400: { "error": "이미 등록된 라이선스 키입니다." }
```

---

### `PUT /items/:no`
라이선스 키 또는 사용자명 수정. member를 빈 문자열(`""`)로 보내면 사용자 배정 해제,
member를 아예 빼면 NULL(미배정)로 저장한다.

```json
Request Body: { "key": "...", "member": "홍길동" }
Response 200: { 수정된 행 }
Response 400: { "error": "잘못된 요청입니다." }          // :no가 양의 정수가 아니거나 2147483647 초과
Response 400: { "error": "라이선스 키는 필수 항목입니다." }
Response 400: { "error": "이미 등록된 라이선스 키입니다." }
Response 404: { "error": "존재하지 않는 라이선스입니다." }
```

---

### `DELETE /items/:no`
소프트 삭제. 실제 행 삭제 없이 `isdelete = 1`로 플래그만 변경.

```
Response 204: No Content
Response 400: { "error": "잘못된 요청입니다." }
Response 404: { "error": "존재하지 않는 라이선스입니다." }
```

## 주요 로직 설명

### 목록 필터 조립 (`src/licenses/items-filter.ts`)

`GET /items`는 카테고리·사용 상태·검색 조건이 선택적이라 조건을 동적으로 쌓는다.
`buildItemsConditions`는 TypeORM에 의존하지 않는 순수 함수로, `{ sql, params }` 조건 목록을 돌려주고
서비스가 이를 QueryBuilder의 `andWhere`에 차례로 붙인다. 값은 항상 `:category`, `:search` 같은
이름 있는 파라미터로 바인딩해 SQL 인젝션을 막는다.

```ts
// 전체 검색: 같은 파라미터 하나를 두 컬럼에 재사용
{ sql: "(lk.key ILIKE :search OR lk.member ILIKE :search)", params: { search } }
```

검색어에 포함된 `%`, `_`, `\`는 ILIKE의 와일드카드/이스케이프 문자로 해석되므로,
쿼리에 넣기 전에 `\`로 이스케이프해 사용자가 입력한 문자 그대로 일치하도록 한다.

### 오류 응답 통일 (`src/common/api-exception.filter.ts`)

Nest 기본 오류 형식(`{ statusCode, message, error }`)을 옛 서버 계약인 `{ error: "<문구>" }`로 바꾼다.
DTO 검증 문구도 한국어로 지정해 두어서 프론트가 그대로 토스트에 보여줄 수 있다.

### 경로 번호 검사 (`src/licenses/item-no.pipe.ts`)

전역 `ValidationPipe`(`transform: true`)는 `number`로 선언된 경로 값을 먼저 숫자로 바꾼다.
그러면 `/items/1e3`이 1000으로 통과하므로, `:no`는 문자열 그대로 받아 이 파이프에서 검사한 뒤 숫자로 바꾼다.

### DB 연결 안정성

`pg` 연결 풀은 유휴 연결에서 오류(DB 재시작, 네트워크 끊김 등)가 나면 `'error'` 이벤트를 낸다.
리스너가 없으면 Node가 처리되지 않은 예외로 보고 서버가 죽는데, TypeORM의 PostgreSQL 드라이버가 풀을 만들 때
이 이벤트에 로그 처리기를 붙여 둔다. 그래서 옛 서버의 `pool.on("error", ...)` 같은 코드를 따로 두지 않는다.

### 소프트 삭제 (Soft Delete)

`DELETE` 요청은 실제로 행을 삭제하지 않고 `isdelete = 1`로만 표시한다.
모든 조회에 `isdelete = 0` 조건이 붙어 삭제된 항목은 노출되지 않는다.
이력 보존과 실수 복구가 목적이다.

> **쉽게 말하면:** 데이터를 "휴지통에 버리는" 방식. 실제로 지우지 않아서 나중에 DB에서 직접 꺼낼 수 있다.

## 트러블슈팅

### 서버 연결 안 됨 (프론트 상단 배지 빨간색)

1. `npm run dev`(또는 `npm start`) 실행 여부와 시작 로그의 오류 확인
2. PostgreSQL 서비스 실행 여부 확인 (`pg_isready` 또는 Windows 서비스 `postgresql-x64-18`)
3. `.env`의 비밀번호/포트/DB 이름이 로컬 DB 설정과 일치하는지, 그 DB가 실제로 있는지 확인

### CORS 에러

프론트를 `http://localhost:3000`이 아닌 주소에서 띄웠다면 `.env`의 `CORS_ORIGIN`에 그 주소를 더한다
(예: `CORS_ORIGIN=http://localhost:3000,http://192.168.0.10:3000`).
백엔드 주소가 바뀌었다면 `frontend/.env`의 `VITE_API_URL`도 맞춘다.

### 중복 키 등록 오류

중복 판정은 삭제되지 않은 행(`isdelete = 0`)만 대상으로 한다 (부분 유니크 인덱스 기준).
즉 **소프트 삭제된 키는 별도 조치 없이 동일한 값으로 다시 등록할 수 있으며**, 이미 등록되어
있고 삭제되지 않은 키와 같은 값을 입력할 때만 400 에러가 발생한다.

### `npm install` 때 설치 스크립트 안내가 나올 때

npm 11은 패키지의 설치 스크립트를 승인 전까지 실행하지 않는다(`allowScripts`). `@swc/core`가 이 안내에
나오지만, 플랫폼별 바이너리 패키지가 따로 설치되므로 스크립트 없이도 동작한다(2026-10-23 확인).
공급망 공격 위험을 줄이려고 필요 없는 설치 스크립트는 승인하지 않는다.
