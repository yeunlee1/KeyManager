# KeyManager React + NestJS 전환 설계

- 작성일: 2026-10-23
- 저장소: `C:\DEV\KeyManager` (origin `yeunlee1/KeyManager`, upstream `KimGiJeong1101/KeyManager`)
- 작업 브랜치: `origin/main` 최신에서 만든 `work/2026-10-23-React-NestJS-전환`
- 상태: 사용자 설계 승인(2026-10-23 "진행해"), 원격 push 하지 않음

## 1. 목표

사용자 요청은 두 가지다.

1. 스택을 React + NestJS로 바꾼다.
2. 해킹에 취약하지 않도록 패키지를 모두 최신으로 올린다.

프론트는 이미 React 18(CRA)이므로 React는 유지하고 빌드 도구와 버전을 올린다. 백엔드는 Express를 NestJS로 다시 작성하고, DB 접근은 사용자 선택에 따라 pg 직접 쿼리에서 TypeORM으로 바꾼다.

화면에서 보이는 기능과 API 계약은 지금과 같아야 한다. 사용자가 바뀐 점을 느끼는 곳은 버전과 실행 명령, 환경변수 이름뿐이어야 한다.

## 2. 성공 기준

- 백엔드·프론트 모두 `npm audit` 결과 취약점 0건
- 백엔드 단위 테스트와 실제 PostgreSQL을 쓰는 e2e 테스트 통과
- 프론트 테스트, 타입 검사, ESLint, 프로덕션 빌드 통과
- 백엔드·프론트를 실제로 띄워 등록·검색·필터·페이지 이동·수정·배정 해제·삭제·통계·연결 상태 표시가 지금과 같게 동작
- 라이트·다크 모드와 데스크톱·휴대폰 폭에서 화면이 깨지지 않음(넘침, 겹침, 안 보이는 요소, 동작하지 않는 모달·드롭다운이 없음)

기존 화면을 본 사용자가 디자인을 새로 하기로 했다(2026-10-23). 그래서 전환 단계에서는 지금 화면을 픽셀 단위로 맞추지 않는다. 기능이 같게 동작하고 화면이 깨지지 않는 것까지만 확인한다.

## 3. 버전 기준

| 구분 | 지금 | 전환 후 |
|---|---|---|
| 백엔드 프레임워크 | Express 4 | NestJS 12.2 |
| DB 접근 | pg 직접 쿼리 | TypeORM 1.1 + `@nestjs/typeorm` 12 (드라이버는 pg 최신) |
| 프론트 빌드 | CRA(react-scripts 5, 지원 종료) | Vite 8 |
| React | 18.3 | 19.3 |
| Tailwind CSS | 3.4 | 4.3 |
| 프론트 테스트 | Jest(CRA 내장) | Vitest 5 + Testing Library 16 |
| TypeScript | 5.9 | 6.0.3 |
| Node 요구 버전 | 18.18 이상 | `^22.13.0 \|\| >=24.11.0` |

TypeScript 최신판은 7.0.2지만 NestJS CLI 12(`typescript ~6.0.2` 고정), ts-jest(`<7`), typescript-eslint(`<6.1`)가 아직 7을 지원하지 않는다. 그래서 호환되는 가장 높은 버전인 6.0.3을 백엔드·프론트 공통으로 쓴다. 다른 패키지는 최신 메이저를 쓰고, 설치 시점에 호환 문제가 확인되면 같은 원칙(호환되는 가장 높은 버전)으로 정하고 완료 보고에 적는다.

Node 요구 버전은 TypeORM 1.x(`^20.19 || ^22.13 || >=24.11`)와 Vite 8(`^20.19 || >=22.12`)의 교집합에서 지원이 끝난 Node 20을 뺀 범위다.

지금은 `package-lock.json`이 `.gitignore`에 들어 있어 설치할 때마다 버전이 달라질 수 있고 감사 결과를 재현할 수 없다. 두 프로젝트의 잠금 파일을 저장소에 포함한다.

## 4. 백엔드 설계

### 4-1. 구조

```
backend/src/
├─ main.ts                      # 기동, helmet, CORS, 전역 파이프·필터, 종료 훅
├─ app.module.ts                # ConfigModule + TypeOrmModule + 기능 모듈
├─ config/env.validation.ts     # 환경변수 검증 (DB_PASSWORD 없으면 기동 중단)
├─ data-source.ts               # TypeORM CLI용 DataSource (마이그레이션 생성·실행)
├─ common/api-exception.filter.ts
├─ health/                      # GET /health
├─ categories/                  # GET /categories, constants.ts
├─ licenses/
│  ├─ license-key.entity.ts
│  ├─ licenses.module.ts
│  ├─ licenses.controller.ts    # /items 라우트 5개
│  ├─ licenses.service.ts
│  ├─ items-filter.ts           # 목록 필터 조립 순수 함수 (기존 query-builder.ts 대체)
│  └─ dto/                      # 조회·등록·수정 DTO
└─ migrations/
   └─ <timestamp>-InitLicenseKeys.ts
backend/test/                   # e2e 테스트
```

### 4-2. API 계약 (바꾸지 않음)

| 메서드·경로 | 성공 | 실패 |
|---|---|---|
| `GET /health` | 200 `{ status: "ok" }` | 503 `{ status: "error" }` |
| `GET /categories` | 200 category → version 목록 | - |
| `GET /items` | 200 `{ items, total }` | 500 |
| `GET /items/category-stats` | 200 `[{ category, total, active, available }]` | 500 |
| `POST /items` | 200 등록된 행 | 400 `{ error }`, 500 |
| `PUT /items/:no` | 200 수정된 행 | 400·404 `{ error }`, 500 |
| `DELETE /items/:no` | 204 | 400·404 `{ error }`, 500 |

- 한국어 오류 문구는 지금 문구를 그대로 쓴다. 예를 들어 "키, 카테고리, 버전은 필수 항목입니다.", "지원하지 않는 카테고리입니다.", "지원하지 않는 버전입니다.", "이미 등록된 라이선스 키입니다.", "잘못된 요청입니다.", "라이선스 키는 필수 항목입니다.", "존재하지 않는 라이선스입니다."다.
- `page`, `limit`은 지금처럼 너그럽게 해석한다. 잘못된 값은 400이 아니라 기본값(page 1, limit 10)으로 바꾸고 limit 상한은 100이다.
- 500 응답에는 `error` 필드를 넣지 않는다. 프론트 `getErrorMessage`가 `error`가 없으면 상황별 한국어 기본 문구를 보여주므로 지금 동작이 유지된다.
- `ApiExceptionFilter`가 Nest 기본 오류 형식(`{ statusCode, message, error }`)을 `{ error: "<문구>" }`로 바꾼다.

### 4-3. DB 매핑과 스키마 관리

- 엔티티는 기존 테이블 `license_keys`(따옴표 없이 만든 `LICENSE_KEYS`라서 실제 이름은 소문자)와 컬럼 `no`, `key`, `member`, `isdelete`, `category`, `version`에 그대로 매핑한다. `search_vector`는 DB에 남기고 엔티티에는 넣지 않는다.
- 부분 유니크 인덱스 `license_keys_key_active_uidx`(`key`, `WHERE isdelete = 0`)를 엔티티 `@Index`에도 선언해 엔티티와 DB 정의를 맞춘다.
- `synchronize`는 끈다. 엔티티에 없는 컬럼을 지울 수 있어 기존 DB에 위험하다.
- 첫 마이그레이션은 지금 `initSchema`와 같은 내용을 멱등하게 수행한다. 테이블이 없으면 만들고, 옛 컬럼 레벨 UNIQUE 제약이 있으면 지우고, 부분 유니크 인덱스가 없으면 만든다. 그래서 새 DB와 기존 DB 모두에 안전하다. 기존 DB에는 TypeORM 기록 테이블 `migrations`가 하나 추가된다.
- 마이그레이션은 서버 기동 때 자동 실행한다(`migrationsRun: true`). 마이그레이션 클래스는 경로 패턴이 아니라 클래스 목록으로 등록해 ts 실행(테스트)과 js 실행(빌드본) 모두에서 같게 동작하게 한다.
- 지금처럼 스키마 준비가 실패하면 요청을 받기 전에 종료한다. `TypeOrmModule`의 재시도 횟수를 작게 잡아 실패가 오래 숨지 않게 한다.

### 4-4. 서비스 동작

- 목록: `items-filter.ts`가 QueryBuilder에 카테고리·사용 상태·검색 조건을 붙인다. 값은 항상 파라미터로 바인딩하고, 검색어의 `\`, `%`, `_`는 지금처럼 이스케이프한다. 개수 조회와 데이터 조회를 같은 조건으로 수행하고 `no` 오름차순으로 정렬한다.
- 통계: `COUNT(*) FILTER (WHERE ...)`로 사용 중·미사용을 한 번에 집계한다. 카테고리가 비면 "미지정"으로 내려준다.
- 사용 중 기준은 지금과 같다. member가 NULL, 빈 문자열, '사용자없음'이면 미사용이다.
- 등록: 키 앞뒤 공백 제거, 필수값·카테고리·버전 검증, 삭제되지 않은 행 중 중복 확인 후 저장한다. 동시 요청으로 유니크 위반(`23505`)이 나면 중복 문구로 400을 준다.
- 수정: `no`가 숫자가 아니면 400, 키가 비면 400, 삭제됐거나 없는 행이면 404다. 유니크 위반은 중복 문구로 400이다.
- 삭제: 소프트 삭제(`isdelete = 1`)를 유지한다. 없는 행이면 404, 성공하면 204다.

### 4-5. 보안 보강

- `helmet`으로 보안 헤더를 붙인다.
- CORS는 모든 출처 허용 대신 `CORS_ORIGIN`(기본 `http://localhost:3000`)만 허용한다.
- 전역 `ValidationPipe`에 `whitelist`를 켜서 DTO에 없는 필드를 버린다.
- 백엔드 README의 "인증 없음(사내망 전용)" 전제는 그대로 둔다. 인증 추가는 이번 범위가 아니다.

## 5. 프론트 설계

- 화면 컴포넌트와 동작은 유지하고 빌드 도구와 버전만 바꾼다.
- CRA 전용 파일을 Vite 방식으로 옮긴다. `public/index.html`은 루트 `index.html`로, `react-app-env.d.ts`는 Vite 타입 선언으로, `process.env.REACT_APP_API_URL`은 `import.meta.env.VITE_API_URL`로 바꾼다. 아무 인자 없이 호출해 실제로는 아무 일도 하지 않던 `reportWebVitals`와 `web-vitals`는 걷어낸다.
- 개발 서버 포트는 3000을 유지한다.
- Tailwind 4는 설정을 CSS(`@theme`)로 옮기고 `@tailwindcss/vite`를 쓴다. `tailwindcss-animate`는 Tailwind 4용 대체 패키지로 바꾼다. 공식 업그레이드 도구가 처리하는 기본값 변화(테두리 기본색, ring 두께 등)는 그대로 받아들이고, 화면이 깨지는 경우만 고친다. 디자인은 다음 단계에서 새로 한다.
- 테스트는 Vitest + jsdom + Testing Library로 옮기고 기존 테스트(`App.test.tsx`, `pagination.test.ts`)를 유지한다.
- CRA에 들어 있던 ESLint 검사는 flat config로 다시 붙인다.

## 6. 짝 작업 분담

- 주작성자 Claude: `backend/` 전체, 루트 `README.md`, `project-overview.md`, 루트 `.gitignore`
- 짝 Codex(`gpt-6.1-sol`, xhigh): `frontend/` 전체
- 공유 자원: 서버와 DB는 Claude가 하나 띄워 같이 쓴다. 포트는 백엔드 5000, 프론트 3000이다.
- 끝나면 서로 상대 몫을 교차 확인한다. 화면은 둘 다 실제 화면으로 본다.

## 7. 검증 계획

1. 전환 전: 기존 앱을 띄워 사용자와 함께 확인했다(2026-10-23). 디자인을 새로 하기로 해서 픽셀 비교용 기준 화면은 만들지 않는다.
2. 백엔드: `items-filter` 단위 테스트(기존 query-builder 테스트 이식), `keymanager_test` DB를 쓰는 e2e 테스트(등록, 공백 키, 잘못된 카테고리·버전, 중복, 삭제 후 재등록, 수정, 배정 해제, 404, 잘못된 번호, 삭제, 통계, 검색 이스케이프, 페이지, 상태 필터, health), 빌드, `npm audit`
3. 프론트: 테스트, 타입 검사, ESLint, 빌드, `npm audit`
4. 통합: 두 서버를 띄워 화면 기능 전체를 확인하고, 라이트·다크와 데스크톱·휴대폰 폭에서 화면이 깨지지 않는지 본다.

## 8. DB 사용 범위 (사용자 승인 2026-10-23)

- 대상: 이 PC에 새로 설치하는 로컬 PostgreSQL 18. 회사·운영 DB는 건드리지 않는다.
- 개발 DB `keymanager`: 서버 기동 때 `license_keys` 테이블과 인덱스(전환 후에는 `migrations` 기록 테이블 포함)를 만든다.
- 시험 DB `keymanager_test`: e2e 테스트가 시험마다 테이블을 비우고 다시 채운다.
- 예시 데이터 입력은 이 승인 범위에 들지 않는다. 필요하면 따로 확인받는다.

## 9. 범위 밖

- 로그인·권한 추가
- 화면 디자인 변경
- 원격 push와 PR 생성

## 10. 다음 단계 (사용자 결정 2026-10-23)

전환이 끝나면 아래 순서로 따로 진행한다. 각 단계는 별도로 설계하고 승인받는다.

1. 프론트 표준 수립: 새 디자인을 시작하기 전에 프론트 표준을 먼저 만든다.
2. 새 디자인: 새 스택과 프론트 표준 위에서 시안 2~3개를 보여 주고 사용자가 고른 방향으로 화면을 다시 만든다.
