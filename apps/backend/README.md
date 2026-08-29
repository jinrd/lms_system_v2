# LMS System V2 - Backend API (`@lms/backend`)

NestJS 기반의 LMS(학습 관리 시스템) 백엔드 RESTful API 서비스입니다.

---

## 🛠 주요 기술 스택

- **Framework**: [NestJS 11](https://nestjs.com/)
- **Database / ORM**: PostgreSQL, [Prisma 7.8](https://www.prisma.io/) (`@prisma/adapter-pg`)
- **인증 및 보안**: JWT (`@nestjs/jwt`), Argon2 (`argon2`), Request ID 추적 미들웨어
- **유효성 검사**: `class-validator`, `class-transformer`, `joi`
- **테스트**: Jest, Supertest (E2E)

---

## 📂 디렉토리 구조

```text
apps/backend/
├── prisma/
│   ├── schema.prisma           # 데이터베이스 모델 정의
│   └── migrations/             # 마이그레이션 이력
├── src/
│   ├── auth/                   # 인증 (로그인, 로그아웃, 비밀번호 변경, 세션 관리)
│   ├── classes/                # 기수/반 관리, 강사 배정
│   ├── courses/                # 개설 강의 관리 및 포함 과목 매핑
│   ├── education/              # 교육 분야 및 세부 과목 마스터 관리
│   ├── prisma/                 # PrismaService 및 글로벌 DB 모듈
│   ├── terms/                  # 약관 관리 및 동의 내역
│   ├── users/                  # 사용자 관리 (승인/반려, 임시 비밀번호, 상태 변경)
│   ├── global-exception.filter.ts # 글로벌 에러 응답 포맷 필터
│   ├── health.controller.ts    # 헬스체크 (/health)
│   ├── main.ts                 # 애플리케이션 엔트리포인트
│   └── request-id.middleware.ts# 요청별 x-request-id 추적
├── test/                       # E2E 테스트 스위트
└── package.json
```

---

## 🚀 개발 환경 설정 및 실행

### 1. 환경 변수 설정
프로젝트 루트 또는 `apps/backend/.env` 파일에 환경변수를 설정합니다.

```env
NODE_ENV=development
PORT=3000
DATABASE_URL="postgresql://username:password@localhost:5432/lms_db?schema=public"
JWT_ACCESS_SECRET="your-super-secret-jwt-key-min-32-chars-long"
JWT_ISSUER="lms-system"
JWT_AUDIENCE="lms-app"
```

### 2. 의존성 설치 및 Prisma 클라이언트 생성
```bash
# 모노레포 루트에서 실행
pnpm install

# Prisma 클라이언트 코드 생성
pnpm --filter @lms/backend exec prisma generate
```

### 3. 서버 실행
```bash
# 개발 모드 (Watch)
pnpm --filter @lms/backend run start:dev

# 프로덕션 빌드 & 실행
pnpm --filter @lms/backend run build
pnpm --filter @lms/backend run start:prod
```

---

## 🧪 테스트 실행

```bash
# 단위 테스트
pnpm --filter @lms/backend run test

# E2E 테스트
pnpm --filter @lms/backend run test:e2e

# 커버리지 측정
pnpm --filter @lms/backend run test:cov
```
