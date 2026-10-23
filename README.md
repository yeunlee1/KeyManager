# 라이선스 키 관리 시스템

> Windows / MS Office / 한컴오피스 라이선스 키를 등록하고, 사용자 배포 현황을 관리하는 내부 관리 도구.

회사에서 여러 PC에 소프트웨어를 설치할 때, 라이선스 키가 어느 직원에게 배정됐는지 한눈에 파악하기 어렵습니다.
이 시스템은 **키 등록 → 사용자 배정 → 현황 조회**를 웹 브라우저에서 바로 처리할 수 있도록 만들어졌습니다.

### 주요 기능

- 라이선스 키 등록 (Windows / MS Office / 한컴오피스)
- 키별 사용자 배정 및 해제
- 카테고리별 사용 중 / 미사용 통계 확인 (호버 시 카테고리별 상세)
- 키 검색 (키 번호 또는 사용자명으로), 사용 상태 필터
- 키 삭제 (실수 복구가 가능한 소프트 삭제 방식)
- 다크 / 라이트 모드

### 전체 동작 흐름

```
[브라우저]  ←──── React + TypeScript 앱 (Vite, localhost:3000)
    │
    │  HTTP 요청 (axios)
    ▼
[백엔드]    ←──── NestJS + TypeScript 서버 (localhost:5000)
    │
    │  TypeORM (pg 드라이버)
    ▼
[데이터베이스] ── PostgreSQL
```

브라우저에서 버튼을 클릭하면 → 백엔드 서버에 요청을 보내고 → 서버가 DB에서 데이터를 가져와 응답합니다.
세 가지(프론트엔드 / 백엔드 / DB)가 모두 실행 중이어야 정상 동작합니다.

---

## 기술 스택

| 구분 | 기술 |
|------|------|
| Frontend | React 19, Vite 8, TypeScript 6.0, Tailwind CSS 4, Radix UI, lucide-react, Axios, Vitest |
| Backend | Node.js, NestJS 12, TypeORM 1.x, TypeScript 6.0, Vitest |
| Database | PostgreSQL (18에서 확인) |

프론트엔드와 백엔드 모두 TypeScript로 작성되어 있으며, 각각 독립적인 `package.json`/`tsconfig.json`을 가진 별도 프로젝트입니다.
두 프로젝트 모두 `package-lock.json`을 저장소에 함께 두어, 누가 설치해도 같은 버전이 설치되고 `npm audit` 결과를 재현할 수 있습니다.
TypeScript는 7.0이 최신이지만 NestJS CLI와 typescript-eslint가 아직 지원하지 않아 6.0에 고정했습니다.

---

## 프로젝트 구조

```
KeyManager/
├── backend/     # NestJS REST API 서버 (src/licenses, health, categories, migrations, test/)
└── frontend/    # React SPA (src/features, components/ui, api, types, lib)
```

각 폴더의 세부 구조, 실행 방법, API 명세, 트러블슈팅은 폴더별 README를 참고하세요.

- [backend/README.md](backend/README.md) — API 서버 실행 방법, DB 스키마, API 명세
- [frontend/README.md](frontend/README.md) — 웹 UI 실행 방법, 폴더 구조, 주요 컴포넌트 설명

---

## 빠른 시작

### 사전 요구사항

- **Node.js 22.22.3 이상(22 계열), 24.15.0 이상(24 계열) 또는 26 이상** (홀수 버전 25는 지원하지 않음) (권장: 현재 Active LTS — https://nodejs.org 에서 LTS 다운로드)
- **PostgreSQL** — 설치: https://www.postgresql.org/download/ (Windows는 EDB 설치 파일이 서비스 등록까지 해 줘서 편합니다)

```bash
node -v         # v22.22.3+(22 계열), v24.15.0+(24 계열), v26+ 중 하나면 OK
psql --version  # PostgreSQL 버전이 출력되면 OK
```

### 데이터베이스

PostgreSQL에 앱이 쓸 DB를 하나 만듭니다. 테이블은 백엔드가 처음 시작할 때 자동으로 만듭니다.

```bash
createdb -U postgres keymanager
```

### 백엔드

```bash
cd backend
cp .env.example .env   # DB 접속 정보 입력 (DB_PASSWORD는 꼭 채워야 서버가 시작됩니다)
npm install
npm run dev             # http://localhost:5000
```

### 프론트엔드

```bash
cd frontend
npm install
npm run dev              # http://localhost:3000
```

### 시험

```bash
cd backend && npm test && npm run test:e2e   # e2e는 keymanager_test DB를 자동으로 만들어 씁니다
cd frontend && npm test
```

자세한 환경 변수, 배포용 빌드 방법은 각 폴더의 README를 참고하세요.

---

## 사용자 배정 상태 기준

라이선스 키의 `member` 값에 따라 사용 중 / 미사용 상태가 결정됩니다 (프론트/백엔드 공통 기준).

| member 값 | 상태 |
|-----------|------|
| NULL | 미사용 |
| `''` (빈 문자열) | 미사용 |
| `'사용자없음'` | 미사용 |
| 그 외 문자열 | 사용 중 |
