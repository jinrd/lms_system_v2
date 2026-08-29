# LMS System V2 - Frontend App (`@lms/frontend`)

React 19와 Vite 기반의 LMS(학습 관리 시스템) 웹 프론트엔드 애플리케이션입니다.

---

## 🛠 주요 기술 스택

- **Core**: [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/)
- **Bundler & Dev Server**: [Vite 8](https://vite.dev/)
- **Routing & State**: [React Router v7](https://reactrouter.com/), [TanStack Query v5](https://tanstack.com/query)
- **UI & Styling**: Pure CSS Design Token System (Dark/Light 모드 및 반응형 AppShell 지원), [Lucide React](https://lucide.dev/)
- **Testing**: Vitest, React Testing Library

---

## 📂 디렉토리 구조

```text
apps/frontend/
├── public/                     # 정적 에셋 (파비콘, SVG 아이콘 등)
├── src/
│   ├── assets/                 # 이미지 및 미디어 에셋
│   ├── auth/                   # 인증 상태 관리 컨텍스트 및 라우트 보호 가드 (RequireAuth, GuestOnly)
│   ├── components/
│   │   ├── layout/             # AppShell (사이드바, 헤더, 내비게이션)
│   │   └── ui/                 # 로딩, 에러, 공통 상태 컴포넌트
│   ├── lib/                    # API 클라이언트 (Axios) 및 유틸리티
│   ├── pages/                  # 페이지 컴포넌트 (로그인, 비밀번호 변경, 대시보드 등)
│   ├── App.css
│   ├── App.tsx                 # 라우터 설정 및 루트 컴포넌트
│   ├── env.ts                  # 프론트엔드 환경변수 접근자
│   ├── index.css               # 글로벌 CSS 및 디자인 시스템 토큰
│   └── main.tsx                # 진입점
├── index.html
├── vite.config.ts
└── package.json
```

---

## 🚀 개발 환경 설정 및 실행

### 1. 개발 서버 실행
```bash
# 모노레포 루트에서 실행
pnpm --filter @lms/frontend run dev
```
브라우저에서 `http://localhost:5173` 으로 접속합니다.

### 2. 프로덕션 빌드 및 미리보기
```bash
# 타입 체크 및 프로덕션 번들 빌드
pnpm --filter @lms/frontend run build

# 빌드 결과물 로컬 미리보기
pnpm --filter @lms/frontend run preview
```

---

## 🧪 테스트 및 린트

```bash
# Vitest 단위 테스트 실행
pnpm --filter @lms/frontend run test

# ESLint 코드 스타일 검사
pnpm --filter @lms/frontend run lint
```
