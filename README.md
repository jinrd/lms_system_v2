# LMS System V2 (차세대 학습 관리 시스템)

학원 및 교육기관을 위한 멀티 테넌트 기반의 차세대 학습 관리 시스템(Learning Management System) 모노레포 프로젝트입니다.

---

## 🛠 기술 스택

### **Backend (`apps/backend`)**
- **Framework**: NestJS (v11)
- **Database / ORM**: PostgreSQL, Prisma ORM (v7.8) with `@prisma/adapter-pg`
- **Authentication & Security**: JWT (`@nestjs/jwt`), Argon2 (`argon2`), Request ID 추적 미들웨어
- **Validation**: `class-validator`, `class-transformer`, `joi`
- **Testing**: Jest, Supertest (E2E)

### **Frontend (`apps/frontend`)**
- **Framework / Bundler**: React 19, TypeScript, Vite (v8)
- **Routing & State**: React Router v7, TanStack Query v5
- **UI & Icons**: Vanilla CSS 디자인 토큰 시스템 (반응형 AppShell), Lucide React
- **Testing**: Vitest, React Testing Library

### **Workspace**
- **Package Manager**: `pnpm` Workspaces

---

## 📂 프로젝트 구조

```text
LmsSystem_V2/
├── apps/
│   ├── backend/                # NestJS 백엔드 API 서버
│   │   ├── prisma/             # Prisma 스키마 및 DB 설정
│   │   └── src/
│   │       ├── auth/           # 인증 및 세션 관리 (로그인, 로그아웃, 비밀번호 변경)
│   │       ├── classes/        # 기수/반 관리 및 강사 배정
│   │       ├── courses/        # 개설 강의 및 과목 매핑 관리
│   │       ├── education/      # 교육 분야 및 교과목 마스터 관리
│   │       ├── prisma/         # Prisma 클라이언트 모듈
│   │       ├── terms/          # 약관 관리 및 동의 이력
│   │       ├── users/          # 사용자(학생/강사/관리자) 승인 및 상태 관리
│   │       ├── app.module.ts
│   │       ├── health.controller.ts
│   │       └── main.ts
│   └── frontend/               # React + Vite 프론트엔드 웹 앱
│       └── src/
│           ├── auth/           # 인증 컨텍스트 및 라우트 가드 (RequireAuth, GuestOnly)
│           ├── components/     # AppShell, 레이아웃, 공통 상태 UI 컴포넌트
│           ├── pages/          # 로그인, 비밀번호 변경, 대시보드 및 메뉴 페이지
│           ├── lib/            # Axios 기반 API 클라이언트
│           └── main.tsx
├── .env.example                # 통합 환경변수 예제
├── pnpm-workspace.yaml         # pnpm 모노레포 워크스페이스 정의
└── README.md
```

---

## 🚀 현재까지 완성된 기능

### 1. 백엔드 (Backend API)
- **시스템 기반 인프라**
  - 글로벌 에러 핸들러(`GlobalExceptionFilter`) 및 요청별 고유 UUID 추적(`RequestIdMiddleware`)
  - 헬스 체크 엔드포인트 (`GET /health`)
  - 환경변수 스키마 검증 (`Joi`)
- **인증 및 세션 (`/auth`)**
  - 로그인 (`POST /auth/login`): 상태 검증, Argon2 비밀번호 검증, 임시 비밀번호 여부 체크 및 JWT 세션 발급
  - 비밀번호 변경 (`POST /auth/change-password`): 임시 비밀번호 변경 및 강제 재로그인 처리
  - 로그아웃 (`POST /auth/logout`): 세션 만료 및 블랙리스트 처리
  - 내 정보 조회 (`GET /auth/me`)
- **사용자 관리 (`/users`)**
  - 회원가입 승인 대기자 목록 조회 및 승인/반려 처리
  - 직원/강사 계정 생성 (`POST /users/staff`)
  - 임시 비밀번호 발급 (`POST /users/:id/temporary-password`)
  - 사용자 상태 변경 (`PATCH /users/:id/status`) 및 키워드 검색 (`GET /users`)
- **약관 관리 (`/terms`)**
  - 회원가입용 필수/선택 약관 문서 생성 및 버전 관리
- **교육과정 마스터 (`/education`)**
  - 교육 분야(`EducationField`) 등록, 수정, 활성화 토글
  - 교과목(`Subject`) 등록, 수정, 활성화 토글
- **개설 강의 관리 (`/courses`)**
  - 개설 강의(`CourseOffering`) 생성, 수정, 상태 변경(PLANNED, RECRUITING, IN_PROGRESS, COMPLETED, CANCELLED)
  - 개설 강의별 포함 과목(`CourseOfferingSubject`) 매핑 및 순서/시간 관리
- **반/기수 관리 (`/classes`)**
  - 반(`Class`) 생성, 정보 수정, 상태 변경
  - 반별 담당 강사(`ClassInstructorAssignment`) 배정 및 주강사/보조강사 설정

### 2. 프론트엔드 (Frontend UI)
- **인증 및 라우팅 시스템**
  - `AuthProvider`: 세션 스토리지 기반 토큰 관리 및 자동 사용자 정보 동기화
  - `RequireAuth` (인증 필수 보호 라우트) & `GuestOnly` (로그인 전용 라우트) 가드
- **레이아웃 & 디자인**
  - 반응형 `AppShell` 레이아웃 (사이드바 메뉴, 상단 네비게이션, 프로필 드롭다운, 모바일 대응)
  - 일관된 테마 토큰 기반 순수 CSS 디자인 시스템 구축
- **화면 구현**
  - 로그인 화면 (`/login`)
  - 최초/임시 로그인 시 비밀번호 변경 화면 (`/change-password`)
  - 메인 대시보드 요약 화면 (`/dashboard`)
  - 주요 메뉴별(공지사항, 문의사항, 교육분야, 강의, 반관리, 출석, 통계 등) 안내 플레이스홀더 화면

---

## 💻 실행 방법 (Getting Started)

### 1. 사전 요구사항 (Prerequisites)
- **Node.js**: `v20.x` 이상
- **pnpm**: `v9.x` 이상 (`npm install -g pnpm`)
- **PostgreSQL**: `v14` 이상 실행 중인 DB 인스턴스

### 2. 환경 변수 설정
프로젝트 루트에 위치한 `.env.example` 파일을 복사하여 루트 또는 `apps/backend` 경로에 `.env` 파일을 생성합니다.

```bash
cp .env.example .env
```

`.env` 파일의 PostgreSQL 연결 정보 및 JWT 시크릿을 설정합니다:
```env
NODE_ENV=development
PORT=3000

# PostgreSQL 연결 URL
DATABASE_URL="postgresql://username:password@localhost:5432/lms_db?schema=public"

# JWT 설정 (최소 32자 이상의 임의 문자열 권장)
JWT_ACCESS_SECRET="your-super-secret-jwt-key-min-32-chars-long"
JWT_ISSUER="lms-system"
JWT_AUDIENCE="lms-app"
```

### 3. 패키지 설치
모노레포 전체 의존성을 설치합니다:

```bash
pnpm install
```

### 4. 데이터베이스 마이그레이션 & Prisma 생성
백엔드 Prisma 클라이언트를 생성하고 DB 스키마를 동기화합니다:

```bash
# Prisma 클라이언트 코드 생성
pnpm --filter @lms/backend run prisma:generate

# DB 마이그레이션 적용 (필요 시)
npx prisma db push --schema=apps/backend/prisma/schema.prisma
```

### 5. 개발 서버 실행

#### 백엔드와 프론트엔드 동시 실행
```bash
# 백엔드 개발 서버 실행 (기본 포트: 3000)
pnpm --filter @lms/backend run start:dev

# (새 터미널) 프론트엔드 개발 서버 실행 (기본 포트: 5173)
pnpm --filter @lms/frontend run dev
```

- **Backend API**: `http://localhost:3000` (Health: `http://localhost:3000/health`)
- **Frontend App**: `http://localhost:5173`

---

## 🧪 테스트 실행

```bash
# 백엔드 단위 테스트
pnpm --filter @lms/backend run test

# 백엔드 E2E 테스트
pnpm --filter @lms/backend run test:e2e

# 프론트엔드 단위 테스트
pnpm --filter @lms/frontend run test
```
