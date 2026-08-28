# 프로젝트 구조 가이드

이 문서는 **`todo-frontend`(Next.js 16 App Router)** 의 폴더 구조, 파일 조직 및 네이밍 컨벤션을 정의합니다.

> ⚠️ **스택 사실의 단일 출처는 [PRD 1.3](../PRD.md#13-기술-스택)이다.** 이 가이드의 서술이 PRD와 어긋나면 PRD를 따른다.
> 특히 **미설치 라이브러리를 `import` 하지 않는다** — PRD 1.3의 "설치 상태" 열을 먼저 확인할 것.
> 화면(경로) 구성의 단일 출처는 [PRD 7장](../PRD.md)이고, 저장소 구성은 [DEV_TOOLING.md 1장](../DEV_TOOLING.md)이다.

> ⚠️ **이 프로젝트는 `src/` 디렉토리를 사용하지 않습니다.**
> `app/`, `components/`, `lib/`가 `todo-frontend/` 루트에 직접 위치합니다.
> (`components.json`의 alias가 `@/components`·`@/lib`이고 css 경로가 `app/globals.css`인 것과 일치)
> 다른 문서나 예시에서 `src/app/...` 경로를 보더라도, 이 프로젝트에서는 `src/`를 빼고 읽으십시오.

## 🏗️ 전체 프로젝트 구조

> ⚠️ **모노레포가 아닙니다.** 루트 · `todo-frontend` · `todo-backend` 는 **독립된 Git 저장소 3개**이며,
> 품질 훅(`core.hooksPath`)도 저장소마다 따로 걸려 있습니다 (`DEV_TOOLING.md` 1장).

```
todo-project/                 # 루트 저장소 (문서·Claude Code 설정)
├── docs/                     # 📚 프로젝트 문서
│   ├── PRD.md               # 무엇을·왜 만드는가 (단일 기준 문서)
│   ├── API_SPEC.md          # 프론트↔백엔드 API 계약
│   ├── ROADMAP.md           # 어떤 순서로 만들 것인가
│   ├── DEV_TOOLING.md       # 품질·보안 도구 구성
│   └── guides/              # 개발 가이드 모음 (이 문서)
├── todo-backend/             # ⚙️ 독립 저장소 — Spring Boot (com.example)
└── todo-frontend/            # 🚀 독립 저장소 — Next.js 16
    ├── app/                 # App Router (src/ 없음!)
    ├── components/          # 🧩 React 컴포넌트
    ├── lib/                 # 🛠️ 유틸리티 및 API 클라이언트
    ├── hooks/               # 🪝 React Query 훅
    ├── providers/           # 🔧 Context 프로바이더
    ├── types/               # 📐 공통 타입
    ├── public/              # 🌍 정적 파일
    ├── components.json      # shadcn/ui 설정 (style: radix-nova)
    ├── next.config.ts       # Next.js 설정
    ├── tsconfig.json        # TypeScript 설정
    └── package.json         # 의존성 및 스크립트
```

## 📁 세부 폴더 구조

### app/ - App Router 페이지

```
app/
├── layout.tsx                    # 🎨 루트 레이아웃 (Providers)
├── page.tsx                      # 🏠 랜딩 — 로그인 상태면 /todos 리다이렉트 (아래 ⚠️ 참조)
├── globals.css                   # 🎨 Tailwind 4 CSS-first 설정 + 디자인 토큰
├── favicon.ico                   # 🔖 파비콘
├── (auth)/                       # 🔐 비인증 라우트 그룹
│   ├── login/page.tsx           # 로그인 페이지
│   └── signup/page.tsx          # 회원가입 페이지
├── (main)/                       # 📋 인증 필요 라우트 그룹
│   ├── layout.tsx               # 인증 가드 + 공통 헤더
│   └── todos/
│       ├── page.tsx             # Todo 목록 (페이지네이션)
│       ├── new/page.tsx         # Todo 작성
│       └── [id]/page.tsx        # Todo 상세/편집
└── oauth2/callback/page.tsx      # OAuth2 콜백 — 리다이렉트 경유 (토큰 수신 아님)
```

> ⚠️ **인증 상태를 클라이언트에서 토큰으로 판정하지 않습니다.**
> 이 프로젝트의 JWT는 **httpOnly 쿠키**로만 오가므로 자바스크립트가 읽을 수 없습니다 (`PRD.md` FR-A06 / NFR-S02).
>
> - `app/page.tsx` 의 리다이렉트 판정 → 서버 사이드에서 쿠키 존재를 확인하거나 `GET /api/auth/me` 응답으로 판정
> - `app/oauth2/callback/page.tsx` → 쿠키는 백엔드 `OAuth2SuccessHandler` 가 **이미 심은 상태**입니다.
>   이 화면은 목적지로 넘기는 역할만 합니다. 성공 → `/todos`, 실패 → `/login?error=oauth`
> - `app/(main)/layout.tsx` 의 인증 가드도 같은 원칙을 따릅니다.
>
> 화면 7개(`/`, `/login`, `/signup`, `/todos`, `/todos/new`, `/todos/[id]`, `/oauth2/callback`)는
> `PRD.md` 7장이 확정한 구성입니다. 임의로 합치거나 다이얼로그로 대체하지 않습니다.

**🚀 App Router 규칙:**

- `page.tsx`: 해당 경로의 메인 페이지
- `layout.tsx`: 레이아웃 컴포넌트 (자식 페이지 감쌈)
- `(그룹명)/`: URL에 영향을 주지 않는 라우트 그룹 — 인증/비인증 레이아웃 분리에 사용
- `loading.tsx`: 로딩 UI (필요시)
- `error.tsx`: 에러 UI (필요시)
- `not-found.tsx`: 404 페이지 (필요시)

### components/ - 컴포넌트 조직

```
components/
├── ui/                     # 🎛️ 기본 UI 컴포넌트 (shadcn/ui, 자동 생성)
│   ├── button.tsx
│   ├── card.tsx
│   ├── input.tsx
│   └── ...
├── layout/                 # 🏗️ 레이아웃 — 페이지 골격
│   ├── Header.tsx         # 공통 헤더 (로고 / 테마 토글 / 로그인 상태별 메뉴)
│   └── ThemeToggle.tsx    # 🌓 다크모드 토글 (FR-U01)
├── common/                 # 🧱 전역 공통 컴포넌트 (도메인 무관)
│   ├── Pagination.tsx     # ✅ 직접 구현, 번호 축약 (FR-U06)
│   ├── LoadingSpinner.tsx # 로딩 상태 (FR-U03)
│   ├── ErrorMessage.tsx   # 에러 + 재시도 (FR-U05)
│   └── EmptyState.tsx     # 빈 상태 (FR-U04)
├── auth/                   # 🔐 인증 관련
│   ├── LoginForm.tsx
│   ├── SignupForm.tsx
│   └── SocialLoginButtons.tsx
├── todo/                   # 📝 Todo 도메인
│   ├── TodoList.tsx
│   ├── TodoItem.tsx
│   ├── TodoForm.tsx
│   └── TodoFilter.tsx
└── editor/                 # ✏️ 에디터
    └── TiptapEditor.tsx
```

> `providers/`는 `components/` 안이 아니라 **루트의 별도 디렉토리**입니다 (`providers/QueryProvider.tsx`, `providers/ThemeProvider.tsx`).

### lib/ - 유틸리티 및 API 클라이언트

```
lib/
├── api/
│   ├── client.ts          # fetch 래퍼 — credentials: "include", 401 처리
│   ├── auth.ts            # 인증 API (signup, login, logout, me)
│   └── todos.ts           # Todo API (CRUD, 토글) — 파일명은 복수형
├── schemas/               # Zod 스키마 (비밀번호는 .min(6) 이 전부)
└── utils.ts               # cn() 등
```

> ❌ **`lib/auth/token.ts` 같은 토큰 저장 모듈을 만들지 않습니다.**
> JWT는 httpOnly 쿠키로만 전달되므로 저장·조회·헤더 첨부가 모두 불필요하고, 애초에 불가능합니다.
> `client.ts` 가 하는 인증 관련 일은 **`credentials: "include"` 한 줄이 전부**입니다 (`API_SPEC.md` 1.2).
>
> **모든 API 호출은 `lib/api/`를 경유**합니다. 컴포넌트에서 `fetch`를 직접 호출하지 않습니다.
> 서버 상태는 `hooks/useTodos.ts` 등 React Query 훅으로 관리합니다.

**🧩 컴포넌트 분류 규칙:**

이 프로젝트가 실제로 쓰는 분류는 아래 5가지뿐입니다. 여기 없는 폴더(`sections/`, `navigation/` 등)는 만들지 않습니다.

| 폴더      | 담는 것                                                      | 판단 기준                                               |
| --------- | ------------------------------------------------------------ | ------------------------------------------------------- |
| `ui/`     | shadcn/ui 기본 컴포넌트 (자동 생성)                          | 비즈니스 로직 없음. props로만 동작 제어. 직접 수정 지양 |
| `layout/` | `Header`, `ThemeToggle`                                      | 페이지 골격·전역 크롬                                   |
| `common/` | `Pagination`, `LoadingSpinner`, `ErrorMessage`, `EmptyState` | 도메인 무관하게 여러 화면이 재사용                      |
| `auth/`   | `LoginForm`, `SignupForm`, `SocialLoginButtons`              | 인증 도메인 전용                                        |
| `todo/`   | `TodoList`, `TodoItem`, `TodoForm`, `TodoFilter`             | Todo 도메인 전용                                        |
| `editor/` | `TiptapEditor`                                               | 에디터 (M5 도입)                                        |

> `providers/` 는 `components/` 안이 아니라 **프로젝트 루트의 별도 디렉터리**입니다
> (`providers/QueryProvider.tsx`, `providers/ThemeProvider.tsx`).
> `types/` 와 `hooks/` 도 마찬가지로 루트에 둡니다 (`types/api.ts`, `hooks/useTodos.ts`) —
> 일부 범용 템플릿은 이들을 `lib/` 하위에 두지만 이 프로젝트는 다릅니다.

**어느 폴더에 넣을지 헷갈릴 때:**

1. 한 화면에서만 쓰는가 → 도메인 폴더(`auth/`, `todo/`)
2. 여러 화면이 쓰지만 도메인과 무관한가 → `common/`
3. 페이지 골격인가 → `layout/`
4. shadcn CLI가 생성했는가 → `ui/` (손대지 않음)

## 🏷️ 파일 네이밍 컨벤션

### 파일명 규칙

```bash
# ✅ 올바른 파일명
user-profile.tsx        # kebab-case (권장)
UserProfile.tsx         # PascalCase (컴포넌트)
userProfile.tsx         # camelCase (허용)

# ❌ 잘못된 파일명
user_profile.tsx        # snake_case (금지)
userprofile.tsx         # 소문자만 (금지)
```

### 컴포넌트 네이밍

```typescript
// ✅ 올바른 컴포넌트 네이밍
export function UserProfile() {} // PascalCase
export function LoginForm() {} // PascalCase
export function APIEndpoint() {} // 약어도 PascalCase

// ❌ 잘못된 컴포넌트 네이밍
export function userProfile() {} // camelCase (금지)
export function login_form() {} // snake_case (금지)
```

### 폴더 네이밍

```bash
# ✅ 올바른 폴더명
components/             # 소문자
user-settings/          # kebab-case
api-routes/            # kebab-case

# ❌ 잘못된 폴더명
Components/            # PascalCase (금지)
user_settings/         # snake_case (금지)
```

## 🔗 경로 별칭 (Path Aliases)

`components.json`에 정의된 경로 별칭:

```typescript
// ✅ 경로 별칭 사용 (권장)
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LoginForm } from "@/components/login-form";

// ❌ 상대 경로 사용 (금지)
import { Button } from "../../../components/ui/button";
import { cn } from "../../lib/utils";
```

**📍 정의된 별칭:**

`tsconfig.json` 의 `paths` 는 **`"@/*": ["./*"]` 하나뿐**입니다. 즉 `@/` 는 `todo-frontend/` 루트를 가리킵니다.

- `@/components/ui/button` → `components/ui/button`
- `@/lib/utils` → `lib/utils`
- `@/hooks/useTodos` → `hooks/useTodos`
- `@/types/api` → `types/api`

> ⚠️ `components.json` 에도 `aliases` 항목이 있지만 그것은 **shadcn CLI가 파일을 어디에 생성할지** 정하는 설정이며,
> import 경로 별칭이 아닙니다. `@/ui/...` · `@/utils` 같은 축약 경로는 **해석되지 않습니다.**

## 📝 새 파일/폴더 추가 규칙

### 1. 새 UI 컴포넌트 추가

```bash
# shadcn/ui 컴포넌트 추가
npx shadcn@latest add [component-name]

# 커스텀 UI 컴포넌트 추가
components/ui/custom-component.tsx
```

### 2. 새 페이지 추가

```bash
# 정적 페이지
app/about/page.tsx

# 동적 페이지
app/users/[id]/page.tsx

# 그룹 라우트
app/(auth)/login/page.tsx
```

### 3. 새 비즈니스 컴포넌트 추가

```bash
# 위치 결정 기준:
1. 특정 페이지에서만 사용 → 해당 페이지 폴더 내
2. 여러 페이지에서 사용 → components/ 적절한 카테고리
3. 레이아웃 관련 → components/layout/
4. 네비게이션 관련 → components/navigation/
```

### 4. 새 유틸리티 추가

```bash
# 공통 유틸리티
lib/utils.ts            # 기존 파일에 추가

# 특화된 유틸리티
lib/date-utils.ts       # 새 파일 생성
lib/api-utils.ts        # 새 파일 생성
```

## 🎯 코드 조직 베스트 프랙티스

### 1. 단일 책임 원칙

- 하나의 파일은 하나의 주요 기능만 담당
- 관련된 타입과 유틸리티는 같은 파일에 포함 가능

### 2. 의존성 순서

```typescript
// 1. 외부 라이브러리
import React from "react";
import { NextPage } from "next";

// 2. 내부 라이브러리 (@/ 경로)
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// 3. 상대 경로
import "./component.css";
```

### 3. Export 규칙

```typescript
// ✅ Named export 사용 (권장)
export function LoginForm() {}

// ✅ Default export (페이지 컴포넌트)
export default function LoginPage() {}

// ❌ 혼재 사용 지양
export function LoginForm() {}
export default LoginForm; // 같은 컴포넌트를 두 방식으로 export
```

### 4. 파일 크기 관리

- 단일 파일: 300줄 이하 권장
- 300줄 초과 시 분할 고려
- 관련 기능별로 분리

## 🚫 금지사항

### ❌ 피해야 할 구조

```bash
# 깊은 중첩 구조 (4단계 이상)
components/pages/auth/forms/login/LoginForm.tsx

# 의미 없는 폴더명 (단, common/ 은 이 프로젝트의 확정 분류이므로 예외)
components/misc/
components/shared/
components/etc/

# 혼재된 케이스
Components/userProfile/LoginForm.tsx
```

### ❌ 피해야 할 패턴

```typescript
// 거대한 파일
export function SuperMegaComponent() {
  // 500줄 이상의 코드
}

// 혼재된 import
import Button from "@/components/ui/button"; // default
import { Card } from "@/components/ui/card"; // named

// 깊은 상대 경로
import { utils } from "../../../../../lib/utils";
```

## ✅ 체크리스트

새 파일/폴더 추가 시 확인사항:

- [ ] 적절한 카테고리 폴더에 배치
- [ ] kebab-case 파일명 사용
- [ ] PascalCase 컴포넌트명 사용
- [ ] 경로 별칭 사용
- [ ] 단일 책임 원칙 준수
- [ ] 적절한 export 방식 선택
- [ ] 의존성 import 순서 준수
- [ ] 파일 크기 300줄 이하 유지
- [ ] **토큰을 저장·조회·첨부하는 코드가 없다** (`PRD.md` FR-A06 / NFR-S02)
- [ ] 미설치 라이브러리를 import 하지 않았다 (`PRD.md` 1.3 설치 상태 열)

이 가이드를 따라 일관성 있고 유지보수하기 쉬운 프로젝트 구조를 만들어보세요!
