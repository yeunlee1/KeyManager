# KeyManager React + NestJS 전환 구현 계획

> **에이전트 작업자용:** 이 계획은 Claude(주작성자)와 Codex(짝)가 pair-working 방식으로 나눠 수행한다. 단계는 체크박스(`- [ ]`)로 추적한다.

**목표:** Express 백엔드를 NestJS 12 + TypeORM 1.x로 다시 작성하고, CRA 프론트를 Vite 8 + React 19 + Tailwind 4로 옮겨 모든 의존성을 최신으로 올린다. API 계약과 화면 기능은 그대로 유지한다.

**구조:** 백엔드는 ESM NestJS 앱으로, 라이선스 기능을 `licenses` 모듈 하나에 모으고 DB 스키마는 TypeORM 마이그레이션으로 관리한다. 프론트는 컴포넌트를 그대로 두고 빌드·스타일·테스트 도구만 교체한다. 양쪽 테스트 도구는 Vitest로 통일한다.

**기술 스택:** NestJS 12.2, TypeORM 1.1, pg 8.23, class-validator 0.15, helmet 8, Vitest 5 + unplugin-swc, React 19.3, Vite 8, Tailwind 4.3, ESLint 10, TypeScript 6.0.3

**설계 문서:** `C:\DEV\11_로컬작업물\KeyManager\설계\2026-10-23-React-NestJS-전환-설계.md` (실행자는 두 문서를 함께 읽는다)

## 전역 제약

- 저장소 `C:\DEV\KeyManager`, 기준 `origin/main`, 작업 브랜치 `work/2026-10-23-React-NestJS-전환`. Codex는 Orca가 만든 별도 작업 폴더의 `work/2026-10-23-React-NestJS-전환-프론트`에서 일하고 Claude가 병합 커밋으로 합친다.
- 원격 push 금지. 커밋 제목은 `<타입>: <한국어 설명>`(예: `feat: NestJS 라이선스 API 구현`). `git add -A` 금지, 자기 담당 경로만 add한다.
- TypeScript는 6.0.3 고정(7.0은 NestJS CLI·ts-jest·typescript-eslint 미지원). 나머지는 최신 메이저. 예외는 `@types/node`로, 실행 Node 24에 맞춰 `^24`를 쓴다.
- `engines.node`는 `^22.22.2 || ^24.15.0 || >=26.0.0`. (처음엔 `^22.13.0 || >=24.11.0`이었다. 짝이 jsdom 30의 요구 버전을 확인해 `^22.22.2 || >=24.15.0`으로 올렸고, 다시 Vitest 5·jsdom 30이 홀수 Node 25를 제외한다는 점을 확인해 2026-10-23에 이 값으로 최종 확정했다.)
- 백엔드는 ESM(`"type": "module"`, `module`/`moduleResolution`은 `nodenext`). 상대 import는 `.js` 확장자를 붙인다.
- 새 소스 파일 첫 줄에는 역할을 설명하는 한국어 한 줄 주석을 둔다. 주석은 기존 코드처럼 한국어로, 설명 대상 코드 위에 적당한 밀도로 둔다.
- API 경로, 상태 코드, 응답 형태, 한국어 오류 문구는 설계 문서 4-2절과 똑같아야 한다. 특히 `POST /items`는 200(Nest 기본 201이 아님), `DELETE /items/:no`는 204다.
- 오류 문구(정확히 이 문자열):
  - `REQUIRED_CREATE` = "키, 카테고리, 버전은 필수 항목입니다."
  - `UNSUPPORTED_CATEGORY` = "지원하지 않는 카테고리입니다."
  - `UNSUPPORTED_VERSION` = "지원하지 않는 버전입니다."
  - `DUPLICATE_KEY` = "이미 등록된 라이선스 키입니다."
  - `BAD_REQUEST` = "잘못된 요청입니다."
  - `REQUIRED_KEY` = "라이선스 키는 필수 항목입니다."
  - `NOT_FOUND` = "존재하지 않는 라이선스입니다."
- 미사용 기준: member가 NULL, `''`, `'사용자없음'` 중 하나. 사용 중은 그 반대.
- DB는 이 PC의 로컬 PostgreSQL 18만 쓴다. 개발 DB `keymanager`, 시험 DB `keymanager_test`. 시험 코드는 DB 이름이 `keymanager_test`가 아니면 실행을 거부한다.
- 프론트 개발 서버 포트 3000(`strictPort`), 백엔드 5000. 서버 실행은 Claude가 맡고 Codex는 그 주소를 쓴다.
- 이 단계에서는 화면 디자인을 바꾸지 않는다. 기능 동일, 화면 깨짐 없음까지만 맞춘다.

## 검토 초점

시험이 직접 다루지 않으면 사용자가 가장 먼저 부딪힐 입력과 상황이다. 각 줄의 시험은 담당 작업에 넣었다.

1. 옛 Express가 만든 기존 DB(컬럼 레벨 UNIQUE 제약, `search_vector` 컬럼, 기존 행)에서 새 서버를 처음 띄우는 경우. 데이터는 그대로 남고 옛 제약만 사라져야 한다. → 작업 2 `legacy-schema` 시험. 실제 `keymanager` DB도 지금 옛 서버가 만든 테이블을 갖고 있어 작업 4에서 실제로 확인한다.
2. `PUT /items/:no`에 member 없이 key만 보내는 경우. 옛 서버는 member를 NULL(미배정)로 만들었다. 같아야 한다. → 작업 3.
3. 검색어에 `%`, `_`, `\`가 들어간 경우 실제 DB에서 글자 그대로 일치해야 한다. → 작업 3.
4. `page`, `limit`에 문자·음수·너무 큰 값이 오는 경우. 400이 아니라 기본값과 상한(100)으로 처리한다. → 작업 1, 3.
5. 숫자가 아니거나 int 범위(2147483647)를 넘는 `:no`. 옛 서버는 큰 숫자에서 500이 났다. 새 서버는 둘 다 400 `BAD_REQUEST`로 답한다. → 작업 3.

---

## 백엔드 (Claude 담당)

### 작업 1: 백엔드 골격과 목록 필터 순수 함수

**파일:**
- 삭제: `backend/src/server.ts`, `backend/src/db.ts`, `backend/src/query-builder.ts`, `backend/src/query-builder.test.ts`, `backend/src/types.ts`, `backend/jest.config.js`, `backend/nodemon.json`
- 수정: `backend/package.json`, `backend/tsconfig.json`, `backend/.gitignore`
- 생성: `backend/tsconfig.build.json`, `backend/nest-cli.json`, `backend/vitest.config.ts`, `backend/src/licenses/items-filter.ts`, `backend/src/licenses/items-filter.spec.ts`
- 이동: `backend/src/constants.ts` → `backend/src/categories/constants.ts`

**인터페이스:**
- 만드는 것:
  - `parsePagination(pageRaw?: string, limitRaw?: string): { page: number; limit: number; offset: number }`
  - `interface ItemsFilterInput { category?: string; status?: string; searchField?: string; searchValue?: string }`
  - `interface FilterCondition { sql: string; params: Record<string, string> }`
  - `buildItemsConditions(input: ItemsFilterInput, alias: string): FilterCondition[]` — 첫 조건은 항상 `${alias}.isdelete = 0`. 파라미터 이름은 `category`, `search`로 고정한다.

- [ ] **1단계: 브랜치를 만들고 옛 서버를 멈춘다.** `git fetch origin` 뒤 `git switch -c work/2026-10-23-React-NestJS-전환 origin/main`. 3000·5000 포트의 옛 서버(이 세션이 띄운 것만)를 종료한다.
- [ ] **2단계: 패키지 구성.** `package.json`을 ESM으로 바꾸고 의존성을 최신으로 맞춘다. 런타임: `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express`, `@nestjs/config`, `@nestjs/typeorm`, `typeorm`, `pg`, `class-validator`, `class-transformer`, `reflect-metadata`, `rxjs`, `helmet`, `dotenv`. 개발: `@nestjs/cli`, `@nestjs/schematics`, `@nestjs/testing`, `typescript@6.0.3`, `vitest`, `unplugin-swc`, `@swc/core`, `supertest`, `@types/supertest`, `@types/express`, `@types/node@^24`. 스크립트: `build`=`nest build`, `start`=`node dist/main.js`, `dev`=`nest start --watch`, `test`=`vitest run`, `test:e2e`=`vitest run --config vitest.e2e.config.ts`, `migration:run`=`typeorm migration:run -d dist/data-source.js`, `migration:generate`=`typeorm migration:generate -d dist/data-source.js`. tsconfig는 Nest ESM 기본값(`target` ES2023, 데코레이터 옵션 켬, `types: ["vitest/globals", "node"]`). npm 11의 `allowScripts` 안내가 나오면 `@swc/core`처럼 실제로 필요한 설치 스크립트만 승인한다.
- [ ] **3단계: 실패하는 시험 작성.** 기존 `query-builder.test.ts`의 시험을 `items-filter.spec.ts`로 옮기고 새 인터페이스에 맞춘다. 예시는 아래와 같고, 나머지(카테고리 바인딩, 상태 두 가지, 그 외 상태, key·member·all 검색, 공백 검색어, 조합)도 같은 방식으로 옮긴다.

```ts
it("필터가 없으면 isdelete = 0 조건만 남는다", () => {
  expect(buildItemsConditions({}, "lk")).toEqual([{ sql: "lk.isdelete = 0", params: {} }]);
});
it("searchField='all'은 key와 member를 같은 파라미터로 OR 검색한다", () => {
  const conds = buildItemsConditions({ searchValue: "ABC" }, "lk");
  expect(conds.at(-1)).toEqual({ sql: "(lk.key ILIKE :search OR lk.member ILIKE :search)", params: { search: "%ABC%" } });
});
it("검색어의 %, _, \\ 는 리터럴로 이스케이프된다", () => {
  expect(buildItemsConditions({ searchValue: "100%_off\\now" }, "lk").at(-1)?.params).toEqual({ search: "%100\\%\\_off\\\\now%" });
});
it("limit은 1~100으로 제한되고 잘못된 값은 기본값이 된다", () => {
  expect(parsePagination("1", "9999").limit).toBe(100);
  expect(parsePagination("1", "-5").limit).toBe(1);
  expect(parsePagination("abc", "abc")).toEqual({ page: 1, limit: 10, offset: 0 });
});
```

- [ ] **4단계:** `npm test` → `buildItemsConditions` 미정의로 실패 확인
- [ ] **5단계: 구현.** 옛 `query-builder.ts`의 규칙(카테고리 `allassets`는 무시, 상태 두 가지, 검색 필드 세 가지, 이스케이프)을 그대로 옮긴다.
- [ ] **6단계:** `npm test` → 전부 통과
- [ ] **7단계: 커밋** `refactor: 백엔드를 NestJS ESM 골격으로 바꾸고 목록 필터를 순수 함수로 이식`

### 작업 2: 설정, 엔티티, 마이그레이션

**파일:**
- 생성: `backend/src/config/env.validation.ts`, `backend/src/database/typeorm.options.ts`, `backend/src/licenses/license-key.entity.ts`, `backend/src/migrations/<타임스탬프>-InitLicenseKeys.ts`, `backend/src/data-source.ts`, `backend/vitest.e2e.config.ts`, `backend/test/setup/global-setup.ts`, `backend/test/setup/test-db.ts`, `backend/test/migrations.e2e-spec.ts`
- 수정: `backend/.env.example`

**인터페이스:**
- 만드는 것:
  - `validateEnv(raw: Record<string, unknown>): AppEnv` — `AppEnv = { DB_USER: string; DB_HOST: string; DB_NAME: string; DB_PASSWORD: string; DB_PORT: number; PORT: number; CORS_ORIGIN: string }`. 기본값 `postgres`/`localhost`/`postgres`/5432/5000/`http://localhost:3000`. `DB_PASSWORD`가 비면 "DB_PASSWORD 환경변수가 설정되지 않았습니다. .env 파일을 확인하세요 (.env.example 참고)."로 예외.
  - `buildDataSourceOptions(env: AppEnv): DataSourceOptions` — `type: "postgres"`, `entities: [LicenseKey]`, `migrations: [InitLicenseKeys<타임스탬프>]`(경로 패턴이 아니라 클래스 목록), `synchronize: false`, `migrationsRun: true`.
  - `LicenseKey` 엔티티 — 테이블 `license_keys`, 컬럼 `no`(PK 자동 증가), `key` varchar(100) not null, `member` varchar(100) null 기본값 '사용자없음', `isdelete` int 기본값 0, `category`·`version` varchar(50) null. `@Index("license_keys_key_active_uidx", ["key"], { unique: true, where: '"isdelete" = 0' })`. `search_vector`는 넣지 않는다.
  - 시험 도우미 `createTestDataSource(): Promise<DataSource>`(`keymanager_test` 고정), `truncateLicenseKeys(ds: DataSource): Promise<void>`(`TRUNCATE license_keys RESTART IDENTITY`)

- [ ] **1단계: 시험 DB 준비.** `global-setup.ts`는 `.env`를 읽고 `DB_NAME`을 `keymanager_test`로 덮어쓴 뒤, `postgres` DB에 붙어 `keymanager_test`가 없으면 만든다. 이름이 `keymanager_test`가 아니면 즉시 실패한다. e2e 설정은 `fileParallelism: false`로 파일을 차례로 돌린다.
- [ ] **2단계: 실패하는 시험 작성** (`migrations.e2e-spec.ts`). 각 시험 전에 `license_keys`·`migrations` 테이블을 지운다.
  - `빈 DB에 마이그레이션을 두 번 돌려도 테이블과 부분 유니크 인덱스가 하나씩 생긴다` — `pg_indexes`에서 `license_keys_key_active_uidx`의 `indexdef`가 `WHERE (isdelete = 0)`을 포함
  - `legacy-schema: 옛 서버가 만든 테이블에서 데이터는 남고 옛 UNIQUE 제약만 지워진다` — 옛 DDL(`key VARCHAR(100) NOT NULL UNIQUE`, `search_vector tsvector` 포함)로 테이블을 만들고 행 2개를 넣은 뒤 마이그레이션 실행. `pg_constraint`에 `contype='u'` 0건, 행 2개 유지, `search_vector` 컬럼 유지
  - `삭제된 키와 같은 키는 다시 넣을 수 있고, 살아 있는 키와 같은 키는 23505로 막힌다`
- [ ] **3단계:** `npm run test:e2e` → 실패 확인
- [ ] **4단계: 구현.** 마이그레이션 `up`은 옛 `initSchema`의 SQL 세 덩어리(`CREATE TABLE IF NOT EXISTS`, 옛 UNIQUE 제약 삭제 `DO $$`, `CREATE UNIQUE INDEX IF NOT EXISTS`)를 그대로 쓴다. `down`은 인덱스만 지운다(데이터 보존). `data-source.ts`는 `dotenv/config` + `validateEnv` + `buildDataSourceOptions`로 CLI용 `DataSource`를 기본 내보내기 한다. `.env.example`에 `DB_NAME=keymanager`, `CORS_ORIGIN=http://localhost:3000`을 적는다.
- [ ] **5단계:** `npm run test:e2e` → 통과, `npm test` → 통과
- [ ] **6단계: 커밋** `feat: TypeORM 엔티티와 초기 마이그레이션 추가`

### 작업 3: 라이선스 API

**파일:**
- 생성: `backend/src/licenses/licenses.module.ts`, `licenses.controller.ts`, `licenses.service.ts`, `license-messages.ts`, `dto/list-items.query.ts`, `dto/create-item.dto.ts`, `dto/update-item.dto.ts`, `backend/src/common/api-exception.filter.ts`, `backend/src/app.module.ts`, `backend/src/app.setup.ts`, `backend/test/items.e2e-spec.ts`, `backend/test/setup/test-app.ts`

**인터페이스:**
- 사용하는 것: 작업 1의 `parsePagination`, `buildItemsConditions`, 작업 2의 `LicenseKey`, `buildDataSourceOptions`, `validateEnv`, 시험 도우미
- 만드는 것:
  - `configureApp(app: NestExpressApplication, env: AppEnv): void` — `main.ts`와 시험이 똑같이 쓰는 전역 설정. helmet, CORS(`env.CORS_ORIGIN`만), `ValidationPipe({ whitelist: true, transform: true, exceptionFactory })`, `ApiExceptionFilter`, `enableShutdownHooks()`
  - `ApiExceptionFilter` — `HttpException`은 `{ error: <문구> }`(문구가 배열이면 첫 항목), 그 밖의 예외는 로그를 남기고 500 텍스트 `Server Error`
  - `createTestApp(): Promise<INestApplication>` — `AppModule` + `configureApp`, DB는 `keymanager_test`
  - 서비스 메서드: `list(query): Promise<{ items: LicenseKeyDto[]; total: number }>`, `stats(): Promise<CategoryStat[]>`, `create(dto): Promise<LicenseKey>`, `update(no: number, dto): Promise<LicenseKey>`, `remove(no: number): Promise<void>`
- 결정 사항:
  - 목록 응답의 각 항목은 `no, key, member, category, version` 다섯 필드만 담는다. 정렬은 `no` 오름차순.
  - 등록 검사 순서는 필수값(공백만 있는 키, 문자열이 아닌 값 포함) → 카테고리 → 버전 → 중복이다. DTO 데코레이터의 메시지와 `exceptionFactory`가 이 순서를 지키지 못하면 순서 검사는 서비스에서 한다.
  - `:no`는 `^\d+$`이고 2147483647 이하일 때만 받는다. 그 밖에는 400 `BAD_REQUEST`.
  - 수정에서 member가 없으면 NULL로 저장한다(옛 동작). member는 trim하지 않는다.
  - DB 오류 코드 23505는 `QueryFailedError`의 `driverError.code`로 판별해 400 `DUPLICATE_KEY`로 바꾼다.

- [ ] **1단계: 실패하는 e2e 시험 작성** (`items.e2e-spec.ts`, 각 시험 전에 `truncateLicenseKeys`). 시험 이름과 확인 내용은 아래와 같다.
  - `POST 등록 성공은 200과 member 기본값 '사용자없음'을 돌려준다`
  - `POST 키 앞뒤 공백은 지워서 저장한다`
  - `POST 공백뿐인 키·빠진 필드·숫자 키는 400 REQUIRED_CREATE`
  - `POST 없는 카테고리는 400 UNSUPPORTED_CATEGORY, 카테고리에 없는 버전은 400 UNSUPPORTED_VERSION`
  - `POST 살아 있는 키와 같으면 400 DUPLICATE_KEY, 삭제된 키와 같으면 등록된다`
  - `POST 정의되지 않은 필드(isdelete: 1 등)는 무시된다`
  - `GET 목록은 total과 no 오름차순 항목을 돌려주고 삭제된 행은 빠진다`
  - `GET 카테고리·상태(assigned/unassigned)·검색 필드(key/member/all) 필터가 맞게 걸린다`
  - `GET 검색어 100%_ 는 글자 그대로 일치하는 키만 찾는다`
  - `GET page=abc, limit=9999 같은 값도 400 없이 기본값·상한으로 처리한다`
  - `GET 통계는 카테고리별 total·active·available을 숫자로 돌려주고 빈 카테고리는 '미지정'이다`
  - `PUT 키와 사용자 수정 성공은 200과 수정된 행`
  - `PUT member 없이 보내면 member는 NULL이 되어 미사용으로 집계된다`
  - `PUT 빈 키는 400 REQUIRED_KEY, 다른 행과 같은 키는 400 DUPLICATE_KEY`
  - `PUT·DELETE 없거나 삭제된 번호는 404 NOT_FOUND`
  - `PUT·DELETE 번호가 abc·1.5·99999999999이면 400 BAD_REQUEST`
  - `DELETE 성공은 204이고 이후 목록·통계에서 빠진다`
  - `허용하지 않은 출처의 CORS 요청에는 허용 헤더가 없고, http://localhost:3000에는 있다`
- [ ] **2단계:** `npm run test:e2e` → 실패 확인
- [ ] **3단계: 구현.** 목록은 `createQueryBuilder("lk")`에 `buildItemsConditions` 결과를 `andWhere`로 붙이고 `getManyAndCount`에 `skip/take`를 쓴다. 통계는 `COUNT(*) FILTER (WHERE ...)` 세 개를 `addSelect`로 넣고 `getRawMany` 뒤 숫자로 바꾼다.
- [ ] **4단계:** `npm run test:e2e`, `npm test` → 통과
- [ ] **5단계: 커밋** `feat: NestJS 라이선스 API 구현`

### 작업 4: 상태 확인·카테고리·기동과 백엔드 마무리

**파일:**
- 생성: `backend/src/main.ts`, `backend/src/health/health.controller.ts`, `backend/src/health/health.module.ts`, `backend/src/categories/categories.controller.ts`, `backend/src/categories/categories.module.ts`, `backend/test/health-categories.e2e-spec.ts`
- 수정: `backend/src/app.module.ts`, `backend/README.md`

**인터페이스:**
- 사용하는 것: 작업 3의 `configureApp`, `createTestApp`
- 만드는 것: `GET /health` → DB `SELECT 1` 성공이면 200 `{ status: "ok" }`, 실패면 503 `{ status: "error" }`(예외 필터를 거치지 않게 응답 상태를 직접 지정). `GET /categories` → `VERSION_OPTIONS` 그대로.

- [ ] **1단계: 실패하는 시험 작성** — `health는 200 ok`, `categories는 Windows·MS_Office·Hancom 세 키와 버전 목록을 돌려준다`, `응답에 helmet 보안 헤더(x-content-type-options: nosniff)가 붙는다`
- [ ] **2단계:** 실패 확인 → **3단계:** 구현(`main.ts`는 `validateEnv` → `NestFactory.create` → `configureApp` → `listen(env.PORT)`) → **4단계:** 통과 확인
- [ ] **5단계: 실제 기동 확인.** `npm run build && npm start`로 옛 테이블이 있는 실제 `keymanager` DB에 붙여 띄운다. 마이그레이션 로그, `GET /health` 200, 옛 UNIQUE 제약 0건(읽기 조회)을 확인한다. `DB_PASSWORD`를 비운 임시 환경으로 띄우면 요청을 받기 전에 종료되는지도 본다.
- [ ] **6단계:** `npm audit` → 0건. 남으면 원인 패키지와 해결 버전을 확인해 올리고, 올릴 수 없으면 사유를 기록한다.
- [ ] **7단계:** `backend/README.md`를 새 구조·명령·환경변수·마이그레이션·시험 DB 기준으로 고친다.
- [ ] **8단계: 커밋** `feat: 상태 확인·카테고리 API와 서버 기동 구성`

## 프론트 (Codex 담당)

### 작업 5: Vite 8 + React 19 이전

**파일:**
- 생성: `frontend/index.html`(루트), `frontend/vite.config.ts`, `frontend/src/vite-env.d.ts`, `frontend/tsconfig.app.json`, `frontend/tsconfig.node.json`
- 수정: `frontend/package.json`, `frontend/tsconfig.json`, `frontend/src/index.tsx`, `frontend/src/config.ts`, `frontend/.env.example`, `frontend/.gitignore`
- 삭제: `frontend/public/index.html`, `frontend/src/react-app-env.d.ts`, `frontend/src/reportWebVitals.ts`, `frontend/.npmrc`(`legacy-peer-deps`는 CRA 때문에 있던 것이라 필요 없으면 지운다)

**인터페이스:**
- 만드는 것: `API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000"`. 스크립트 `dev`, `build`(`tsc -b && vite build`), `preview`, `test`, `lint`, `typecheck`.

- [ ] **1단계:** 의존성을 최신으로 맞춘다(React 19.3, Vite 8, `@vitejs/plugin-react` 6, Radix·lucide·sonner·axios·clsx·tailwind-merge·cva·폰트 최신, TypeScript 6.0.3, `@types/react`·`@types/react-dom` 19, `@types/node@^24`). `react-scripts`, `web-vitals`, `@babel/plugin-proposal-private-property-in-object`는 뺀다.
- [ ] **2단계:** 개발 서버를 포트 3000(`strictPort`)으로 설정하고 CRA 전용 파일을 옮긴다. `public/`의 favicon·manifest·로고는 유지한다.
- [ ] **3단계:** React 19 타입 변경(전역 `JSX` 네임스페이스, `ref` 관련 타입 등)으로 생긴 오류를 고친다.
- [ ] **4단계:** `npm run typecheck`, `npm run build` 통과. `npm run dev`로 http://localhost:3000 이 뜨는지 확인한다.
- [ ] **5단계: 커밋** `build: CRA를 Vite 8과 React 19로 이전`

### 작업 6: Tailwind 4 이전

**파일:**
- 수정: `frontend/src/index.css`, Tailwind 클래스가 바뀌는 컴포넌트
- 삭제: `frontend/tailwind.config.js`, `frontend/postcss.config.js`

- [ ] **1단계:** 공식 업그레이드 도구(`npx @tailwindcss/upgrade`)를 돌린 뒤 결과를 직접 검토한다. `@tailwindcss/vite`를 쓰고, 색 토큰·radius·글꼴·keyframes를 `@theme`로, 다크 모드는 `.dark` 클래스 방식(`@custom-variant`)을 유지한다. `tailwindcss-animate`는 `tw-animate-css`로 바꾼다.
- [ ] **2단계:** `npm run build` 통과. 라이트·다크, 1440·768·390 폭에서 넘침·겹침·안 보이는 요소가 없고, 등록 모달·삭제 확인·Select·토스트가 열리고 닫히는지 실제 화면으로 확인한다. 픽셀 단위로 옛 화면에 맞추지는 않는다.
- [ ] **3단계: 커밋** `style: Tailwind CSS 4로 이전`

### 작업 7: 시험·린트·보안 감사

**파일:**
- 생성: `frontend/vitest.config.ts`(또는 `vite.config.ts`의 `test`), `frontend/eslint.config.js`
- 수정: `frontend/src/setupTests.ts`, `frontend/src/App.test.tsx`, `frontend/src/lib/pagination.test.ts`, `frontend/README.md`

- [ ] **1단계:** Vitest 5 + jsdom + Testing Library 16(+ `@testing-library/dom`) + jest-dom 7로 옮기고 기존 시험 두 개를 유지한다. `App.test.tsx`는 API 호출을 가짜로 바꿔 네트워크 없이 돈다.
- [ ] **2단계:** `src/api/items.test.ts`를 만들어 `getErrorMessage는 응답에 error 필드가 있으면 그 문구를, 없으면(500 텍스트 응답 포함) 기본 문구를 돌려준다`를 시험한다. 백엔드의 500 응답에서 화면이 상황별 한국어 기본 문구를 보여주는 동작을 지키기 위한 시험이다.
- [ ] **3단계:** ESLint 10 flat config(`@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `globals`)를 붙이고 `npm run lint` 통과
- [ ] **4단계:** `npm test`, `npm run typecheck`, `npm run build`, `npm audit` 0건
- [ ] **5단계:** `frontend/README.md`를 새 명령·환경변수 기준으로 고친다.
- [ ] **6단계: 커밋** `test: 프론트 시험을 Vitest로 옮기고 ESLint 10 적용`

## 통합 (Claude 주도, 둘 다 확인)

### 작업 8: 병합, 문서, 전체 확인

**파일:**
- 수정: `.gitignore`(잠금 파일 무시 줄 삭제), `README.md`, `project-overview.md`
- 추가: `backend/package-lock.json`, `frontend/package-lock.json`

- [ ] **1단계:** Codex 브랜치를 `work/2026-10-23-React-NestJS-전환`에 병합 커밋으로 합친다. 제목 `build: 프론트 Vite·React 19·Tailwind 4 이전 병합`. (공통 규칙의 커밋 타입 목록에 `merge`가 없어 `build`로 바꿨다. 실제 커밋 `f7244c8`.)
- [ ] **2단계:** 루트 `.gitignore`에서 잠금 파일 무시를 지우고 두 잠금 파일을 커밋한다. 루트 README의 스택·흐름도·빠른 시작과 `project-overview.md`의 스택 설명을 고치고, 개요 끝에 이번 전환 항목을 하나 더한다.
- [ ] **3단계:** 두 서버를 띄워 브라우저로 확인한다. 연결 상태, 등록(성공·중복·필수값), 목록·카테고리 탭·상태 필터·검색·페이지 이동, 수정·배정 해제, 삭제 확인, 통계 펼침, 라이트·다크 전환, 1440·768·390 폭.
- [ ] **4단계: 교차 확인.** Claude는 `frontend/`, Codex는 `backend/`를 본다. 지적은 파일 하나에 모으고 "반드시 고칠 것"은 고친 뒤 지적한 쪽이 다시 본다.
- [ ] **5단계:** 백엔드·프론트 전체 시험, 빌드, `npm audit`을 마지막으로 한 번 더 돌린다. 전환 전 취약점(백엔드 high 3, 프론트 93건/high 63)과 비교해 보고한다.
- [ ] **6단계: 커밋** `docs: 스택 전환에 맞춰 문서와 잠금 파일 갱신`
- [ ] **7단계: 멈추고 보고.** 사용자 지시대로 여기서 멈추고 결과를 보고한 뒤, 추가할 기능을 묻는다(Task Master 작업 5).
