# ROADMAP — Todo List 서비스

| 항목      | 내용                                                                                               |
| --------- | -------------------------------------------------------------------------------------------------- |
| 문서 버전 | v1.1                                                                                               |
| 작성일    | 2026-08-26                                                                                         |
| 개정일    | 2026-08-28 (PRD v1.1 정합화 — 스택 버전·설정 파일 형식·화면 구성·참조 무결성)                      |
| 기준 문서 | `PRD.md` v1.1                                                                                      |
| 관련 문서 | `API_SPEC.md` (API 계약), `DEV_TOOLING.md` (품질·보안 도구), `docs/guides/` (프론트엔드 구현 패턴) |

> 이 문서는 **어떤 순서로, 무엇을 언제 완료할지**를 정의한다.
> 요구사항의 정의는 `PRD.md`, API 계약은 `API_SPEC.md`,
> 프론트엔드 구현 패턴은 `docs/guides/`, 품질·보안 도구는 `DEV_TOOLING.md`에 있다.
> 이 문서가 `PRD.md`와 충돌하면 **언제나 `PRD.md`가 우선**이며, 이 문서를 고친다.

---

## 1. 전체 그림

```
 v1.0 (로컬 완결)                          v1.1              v2.0
 ├─ M0 스캐폴딩                            └─ 배포           └─ 기능 확장
 ├─ M1 도메인
 ├─ M2 인증  ── M2-A 자체 JWT
 │              └ M2-B 구글 OAuth2
 ├─ M3 Todo API
 ├─ M4 프론트 기반
 ├─ M5 화면 구현
 └─ M6 테스트·검증  ← 릴리스 판정
```

### 릴리스 정의

| 릴리스   | 목표                                    | 판정 기준                                         |
| -------- | --------------------------------------- | ------------------------------------------------- |
| **v1.0** | 로컬 환경에서 모든 기능이 완결되게 동작 | `PRD.md` 12장 릴리스 판정 체크리스트 전 항목 통과 |
| **v1.1** | AWS 배포 및 실제 도메인 서비스          | 외부 URL로 접속해 가입~할 일 관리 전 과정 동작    |
| **v2.0** | 사용성 확장 기능                        | 별도 PRD 작성 후 결정                             |

---

## 2. 소요 예상에 대한 전제

이 프로젝트는 1인 개발이고 Claude Code를 사용한다. 소요를 시간이 아니라 **작업 세션 수**로 잡는다.
"1세션"은 한 번 앉아서 프롬프트를 넣고, 결과를 검증하고, 커밋까지 하는 단위다.

| 마일스톤         | 예상 세션 | 난이도   | 막힐 가능성                         |
| ---------------- | --------- | -------- | ----------------------------------- |
| M0 스캐폴딩      | 1         | 낮음     | 낮음 — 버전 충돌 정도               |
| M1 도메인        | 1         | 낮음     | 낮음                                |
| M2-A 자체 JWT    | 1~2       | **높음** | **높음** — Spring Security 7 변경점 |
| M2-B 구글 OAuth2 | 1~2       | **높음** | **높음** — 외부 설정 의존           |
| M3 Todo API      | 1~2       | 보통     | 보통 — 페이지네이션 직렬화          |
| M4 프론트 기반   | 1~2       | 보통     | 보통 — Tailwind 4 / shadcn 조합     |
| M5 화면 구현     | 2~3       | 보통     | 보통 — Tiptap SSR, 낙관적 업데이트  |
| M6 테스트·검증   | 1~2       | 보통     | 낮음                                |

**총 9~15세션.** M2에서 전체 일정의 3분의 1이 소요될 가능성이 높으니, 여기서 시간이 걸려도 정상이라고 보면 된다.

---

## 3. 마일스톤 상세

### M0 — 프로젝트 스캐폴딩

**목표**: 백엔드·프론트엔드가 각각 빈 상태로 기동되고, DB에 연결된다.

작업

- [x] `todo-backend/` Spring Boot **4.1.1** 프로젝트 생성 (JDK 21, Maven Wrapper)
- [x] `todo-frontend/` Next.js **16.3.3** 프로젝트 생성, shadcn/ui 초기화 (style `radix-nova`)
- [x] 저장소 3개 각각 `.gitignore` + 품질 도구 구성 (`DEV_TOOLING.md` 1장)
- [x] PostgreSQL **데이터베이스 `postgres`** 에 **스키마** `todolist_db`, `todolist_test_db` 생성
      — 전부 소문자 표기 (`PRD.md` 8.3)
- [x] `application.properties` 스키마명 표기 통일 (`PRD.md` RISK-4)
- [x] `application-local.properties` 로 DB 비밀번호·JWT 시크릿 분리 + `.gitignore` 처리
      (`PRD.md` RISK-3 / NFR-S03) — **커밋 전 필수**
- [x] `application-test.properties` (test 프로필, `todolist_test_db`)
- [x] 루트 `README.md` 작성 (한국어)
- [x] `GET /api/health` 헬스체크 엔드포인트 (`API_SPEC.md` 4.1)

**완료 조건 (DoD)**

- `./mvnw spring-boot:run` 무오류 기동 + `GET /api/health` 가 `ApiResponse` 형식으로 200
- `npm run dev`, `npm run build` 성공
- `npm run secretlint` 통과 — 저장소에 평문 자격증명 없음 (NFR-S03)

**체크포인트**: `git tag m0-scaffold`

---

### M1 — 도메인 모델

**목표**: 데이터 구조가 확정되고 테이블이 생성된다.
**선행**: M0

작업

- [x] `BaseTimeEntity` + JPA Auditing
- [x] `User` 엔티티 (provider, role, nullable password)
- [x] `Todo` 엔티티 (LAZY 연관, priority, dueDate)
- [x] Soft Delete: `@SQLRestriction("deleted_at IS NULL")`
- [x] `UserRepository`, `TodoRepository` 쿼리 메서드
- [x] users 부분 유니크 인덱스 DDL (`WHERE deleted_at IS NULL`)
- [x] todos 인덱스 `(user_id, deleted_at)`, `(user_id, completed, deleted_at)`

**커버 요구사항**: FR-A12, FR-T11 기반 구조 / NFR-P02

**완료 조건 (DoD)**

- `\dt todolist_db.*` 로 users, todos 확인
- 부분 유니크 인덱스 적용 확인
- 기동 시 Hibernate 매핑 에러 없음

**체크포인트**: `git tag m1-domain`

---

### M2-A — 자체 인증 (이메일 + JWT)

**목표**: 이메일 가입·로그인이 완전히 동작하고 API가 보호된다.
**선행**: M1

> ⚠️ 이 프로젝트에서 가장 막히기 쉬운 구간이다. 구글 로그인은 절대 여기 섞지 않는다.

작업

- [x] BCryptPasswordEncoder 설정
- [x] `JwtTokenProvider` (생성·검증·파싱, 24h, 환경변수 시크릿)
- [x] `JwtAuthenticationFilter` (쿠키에서 토큰 추출)
- [x] `CustomUserDetailsService`
- [x] `SecurityConfig` (STATELESS, CSRF 비활성, 경로별 권한)
- [x] `CorsConfig` (localhost:3000, allowCredentials)
- [x] `POST /api/auth/signup` `/login` `/logout`, `GET /api/auth/me`
- [x] Request DTO Bean Validation
- [x] `ApiResponse<T>` 공통 응답 래퍼 (`API_SPEC.md` 1.3)
- [x] `ErrorCode`, `BusinessException`, `GlobalExceptionHandler` — 에러 코드는 `API_SPEC.md` 1.5 표를 그대로 사용
- [x] **springdoc-openapi 의존성 추가** + `SwaggerConfig` (`PRD.md` 1.3 — M2-A 도입)

**커버 요구사항**: FR-A01~~A07, FR-A10, FR-A11 / NFR-S01~~S04, S07, S08 / NFR-M02, M03

**완료 조건 (DoD)**

- 가입 → 로그인 → `/api/auth/me` curl 검증 통과
- `Set-Cookie: access_token=...; HttpOnly` 확인
- 쿠키 없이 보호 경로 접근 시 401
- DB password가 BCrypt 해시
- 중복 이메일(`EMAIL_DUPLICATED`)·짧은 비밀번호(`VALIDATION_FAILED`)가 `API_SPEC.md` 1.5 형식으로 반환

**체크포인트**: `git tag m2a-jwt-auth`

---

### M2-B — 구글 OAuth2

**목표**: 구글 계정으로 가입·로그인이 되고, 자체 JWT가 발급된다.
**선행**: M2-A 완전 통과

> **사전 준비 필수**: 구글 클라우드 콘솔에서 OAuth 클라이언트 ID를 미리 만들어 둘 것.
> 이걸 안 해두면 이 마일스톤에서 반드시 멈춘다.

작업

- [x] 구글 클라우드 콘솔 OAuth 클라이언트 생성, 리디렉션 URI 등록
- [x] `application.properties` google provider 설정 (scope: email, profile)
- [x] `CustomOAuth2UserService` — 조회 / 계정 연결 / 신규 생성
- [x] `OAuth2SuccessHandler` — 자체 JWT 쿠키 발급 후 프론트로 리다이렉트
- [x] `OAuth2FailureHandler` — 실패 시 `/login?error=oauth`
- [x] SecurityConfig에 OAuth 경로 permitAll

**커버 요구사항**: FR-A08, FR-A09

**완료 조건 (DoD)**

- 브라우저에서 구글 로그인 → 쿠키 발급 → 리다이렉트 성공
- 같은 이메일의 LOCAL 계정 존재 시 중복 생성되지 않고 연결됨
- 동의 취소 시 로그인 페이지로 복귀

**체크포인트**: `git tag m2b-google-oauth`

---

### M3 — Todo CRUD API

**목표**: 할 일 API가 페이지네이션·소유권 검증과 함께 완성된다.
**선행**: M2-A (M2-B와 병행 가능)

작업

- [x] `PageResponse<T>` 공통 DTO (Spring `Page` 직접 반환 금지)
- [x] `GET /api/todos` — page, size, sort, completed 필터, keyword 검색
- [x] `POST /api/todos`, `GET/PATCH/DELETE /api/todos/{id}`
- [x] `PATCH /api/todos/{id}/toggle`
- [x] 전 경로 소유권 스코프 (`findByIdAndUserId`, 실패 시 404 — `deleted_at` 조건은 `@SQLRestriction`이 자동 적용)
- [x] Soft Delete 처리
- [x] description HTML sanitize (**jsoup 의존성 추가**, 허용 태그 화이트리스트 — `API_SPEC.md` 3.2)
- [x] Swagger 어노테이션

**커버 요구사항**: FR-T01~T11, FR-T13 / NFR-S05, S06 / NFR-P01, P02 / NFR-M01

**완료 조건 (DoD)**

- 생성 → 목록 페이지네이션 → 수정 → 토글 → 삭제 curl 전 과정 검증
- 삭제 후 DB에 행 유지 + `deleted_at` 채워짐
- 타 사용자 토큰으로 접근 시 404
- `<script>` 포함 description 저장 시 제거됨

**체크포인트**: `git tag m3-todo-api`

---

### M4 — 프론트엔드 공통 기반

**목표**: 화면을 만들 준비가 끝난다. 이 단계 산출물은 모든 페이지가 공유한다.
**선행**: `API_SPEC.md` 확정 (M3 구현 완료를 기다릴 필요 없음)

> 디렉터리 구조·네이밍은 `guides/project-structure.md`, 컴포넌트 패턴은 `guides/component-patterns.md`,
> 팔레트·테마는 `guides/styling-guide.md` 를 따른다.

작업

- [x] **패키지 설치**: `@tanstack/react-query`, `next-themes` (`PRD.md` 1.3 — M4 도입)
- [x] `types/api.ts` — `ApiResponse<T>` · `PageResponse<T>` · Todo/User DTO (`API_SPEC.md` 1.3~1.4)
- [x] `lib/api/client.ts` — fetch 래퍼. **`credentials: "include"` 만으로 인증이 끝난다.**
      토큰을 저장·조회·첨부하는 코드를 두지 않는다 (FR-A06 / NFR-S02)
- [x] `lib/api/auth.ts`, `lib/api/todos.ts` — 파일명은 **복수형 `todos.ts`** 로 통일
- [x] `providers/QueryProvider.tsx` — React Query Provider
- [x] `providers/ThemeProvider.tsx` — next-themes + 라이트/다크 팔레트 CSS 변수 정의
- [x] `components/layout/Header.tsx`, `components/layout/ThemeToggle.tsx`
- [x] **`components/common/Pagination.tsx`** — 직접 구현, 번호 축약 (FR-U06)
- [x] `components/common/` — `LoadingSpinner`, `ErrorMessage`(재시도), `EmptyState`
- [x] `proxy.ts` — 쿠키 기반 `/todos` 라우트 보호
      (Next.js 16에서 `middleware.ts` → `proxy.ts` 로 개명, `guides/nextjs-16.md` 참조)

**커버 요구사항**: FR-U01, FR-U06, FR-A10(프론트) / NFR-U02, U04 / NFR-M05

**완료 조건 (DoD)**

- `npx tsc --noEmit` 통과, `any` 없음
- 테마 토글 동작 + 새로고침 후 유지
- `npm run build` 통과
- 하드코딩 색상값 없음 (전부 CSS 변수)

**체크포인트**: `git tag m4-frontend-base`

---

### M5 — 화면 구현 및 연동

**목표**: 모든 유저 스토리가 브라우저에서 동작한다.
**선행**: M4, M2-B

작업

> 화면 구성은 `PRD.md` 7장 표(7개 경로)를 그대로 따른다. 임의로 합치거나 나누지 않는다.

- [x] **패키지 설치**: `react-hook-form`, `zod`, `@hookform/resolvers`, `@tiptap/*`, `motion`
      (`PRD.md` 1.3 — M5 도입)
- [x] `/` 랜딩 — 서비스 소개. 로그인 상태면 `/todos` 리다이렉트
      (**쿠키를 JS로 읽지 않는다** — 서버 사이드 판정 또는 `GET /api/auth/me` 결과로 판정)
- [x] `/signup`, `/login` — 폼 검증(Zod, 비밀번호 `.min(6)`), 서버 에러 표시, 구글 버튼
- [x] `/oauth2/callback` — **리다이렉트 경유 화면**. 쿠키는 백엔드가 이미 심었으므로
      토큰을 받거나 저장하지 않는다. 성공 → `/todos`, 실패 → `/login?error=oauth`
- [x] `/todos` 목록 + Pagination 연결
- [x] 완료/미완료 필터, 키워드 검색
- [x] `/todos/new` — **별도 작성 페이지** (제목, 마감일, 우선순위, Tiptap 설명)
- [x] `/todos/[id]` — **별도 상세·편집 페이지**. 다이얼로그·인라인 수정이 아니다
      (`PRD.md` 7장 확정. `[id]` URL 이 있어야 FR-T13 을 URL 레벨에서 검증할 수 있다)
- [x] 완료 토글 — 낙관적 업데이트 + 롤백
- [x] 삭제 — 확인 절차 + 낙관적 업데이트 + 롤백
- [x] Tiptap 클라이언트 전용 렌더링 (`immediatelyRender: false`)
- [x] 로딩 / 에러 / 빈 상태 3종
- [x] motion 애니메이션 (150~250ms)
- [x] 반응형 320 / 768 / 1280 확인

**커버 요구사항**: US-1~~US-9 전체 / FR-T04, FR-T12 / FR-U02~~U05, U07, U08

**완료 조건 (DoD)**

- 가입 → 로그인 → 생성/수정/토글/삭제 전 과정 브라우저 통과
- 토글·삭제가 서버 응답 전 즉시 반영, 실패 시 롤백
- 타인 소유 `/todos/[id]` 직접 접근 시 404 화면 (FR-T13)
- 320px에서 레이아웃 정상
- 라이트·다크 모두 가독성 확보
- `npm run build`, `npm run check` (typecheck + lint:strict + format:check) 통과

**체크포인트**: `git tag m5-ui-complete`

---

### M6 — 통합 테스트 및 최종 검증

**목표**: v1.0 릴리스 판정을 통과한다.
**선행**: M5

작업

- [x] `application-test.properties` (스키마 `todolist_test_db`, `create-drop`)
- [x] 회원가입 성공 / 중복 / 형식 오류 / 짧은 비밀번호
- [x] 로그인 성공 시 쿠키 발급 / 비밀번호 불일치
- [x] 토큰 없이 `/api/todos` → 401
- [x] Todo CRUD 전 과정
- [x] 페이지네이션 (총 건수·페이지 크기·정렬)
- [x] Soft Delete 후 목록 제외 + `deleted_at` 확인
- [x] **타 사용자 Todo 접근 시 404** (FR-T13)
- [x] **탈퇴(soft delete) 이메일로 재가입 가능** — 탈퇴 UI가 없으므로 DB 직접 조작으로만 검증 (FR-A12)
- [x] description `<script>` 제거 확인 (NFR-S05)
- [x] `PRD.md` 12장 체크리스트 전수 확인

> 위 항목은 `AuthControllerTest`·`TodoControllerTest` MockMvc 통합 테스트로 검증했다(CI에서 53개 테스트 전부 통과).
> 진행 중 CI가 두 저장소 모두 선행 결함(`mvnw` 실행 비트 누락, `next typegen` 미실행)으로 매번 실패 중이던 것을 발견해 함께 고쳤다.

**완료 조건 (DoD)**

- [x] `./mvnw verify` 전체 통과 (Spotless 포맷 검사 + 컴파일 + 테스트) — CI 확인
- [x] `npm run check` 통과
- [x] `PRD.md` 12장 릴리스 판정 체크리스트 전 항목 체크

**체크포인트**: `git tag v1.0.0`

---

## 4. 요구사항 추적표

`PRD.md`의 요구사항이 어느 마일스톤에서 구현되고 어디서 검증되는지.

| 요구사항                          | 구현                      | 검증                |
| --------------------------------- | ------------------------- | ------------------- |
| FR-A01~A07 (가입·로그인·JWT)      | M2-A                      | M2-A DoD, M6        |
| FR-A08, A09 (구글 OAuth2)         | M2-B                      | M2-B DoD            |
| FR-A10 (미인증 리다이렉트)        | M2-A + M4                 | M5                  |
| FR-A11 (내 정보 조회)             | M2-A                      | M2-A DoD            |
| FR-A12 (탈퇴 이메일 재가입)       | M1 (인덱스)               | M6                  |
| FR-T01~T03 (생성·마감일·우선순위) | M3 + M5                   | M3 DoD, M5          |
| FR-T04 (리치 텍스트)              | M3(sanitize) + M5(Tiptap) | M5                  |
| FR-T05, T13 (소유권)              | M3                        | M3 DoD, **M6 필수** |
| FR-T06 (페이지네이션)             | M3 + M4 + M5              | M6                  |
| FR-T07, T08 (필터·검색)           | M3 + M5                   | M5                  |
| FR-T09~T11 (수정·토글·삭제)       | M3 + M5                   | M6                  |
| FR-T12 (낙관적 업데이트)          | M5                        | M5 DoD              |
| FR-U01 (테마)                     | M4                        | M4 DoD              |
| FR-U02 (반응형)                   | M4 + M5                   | M5 DoD              |
| FR-U03~U05 (로딩·빈·에러)         | M4 + M5                   | M5 DoD              |
| FR-U06 (페이지네이션 컴포넌트)    | M4                        | M4 DoD              |
| FR-U07 (애니메이션)               | M5                        | M5                  |
| FR-U08 (키보드·포커스)            | M4 + M5                   | M5                  |
| NFR-S01~S08 (보안)                | M2-A, M3                  | M6                  |
| NFR-P01~P02 (성능)                | M1, M3                    | M6                  |
| NFR-U01~U04 (접근성)              | M4, M5                    | M5                  |
| NFR-M01~M05 (유지보수)            | 전 구간                   | M6                  |

**커버되지 않은 요구사항이 없는지 M6에서 이 표를 위에서 아래로 훑는다.**

---

## 5. 의존성과 병행 가능 구간

```
M0 → M1 → M2-A ─┬─→ M2-B ─┐
                └─→ M3 ────┼─→ M5 → M6
                    M4 ────┘
```

- **M2-B와 M3는 병행 가능**하다. 구글 콘솔 설정 때문에 M2-B가 막히면 M3를 먼저 진행한다.
- **M4는 `API_SPEC.md` 에만 의존**한다. 이 문서가 확정되면 백엔드 구현 완료 전에도 시작할 수 있다.
- **M5는 M2-B와 M4가 모두 끝나야** 시작한다. 로그인 화면에 구글 버튼이 들어가기 때문이다.

---

## 6. 리스크 관리

| 리스크                                      | 징후                                                                   | 대응                                                               |
| ------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------ |
| **Spring Security 7 변경점** (`PRD` RISK-1) | `and()` 체이닝, `WebSecurityConfigurerAdapter` 등 구버전 코드가 생성됨 | 람다 DSL만 사용하도록 지시. 컴파일 에러가 나면 즉시 공식 문서 확인 |
| **Hibernate 7 `@Where` 제거**               | Soft Delete 필터가 컴파일 안 됨                                        | `@SQLRestriction`으로 교체                                         |
| **Spring `Page` 직렬화 경고**               | 목록 응답 구조가 불안정하거나 경고 로그                                | `PageResponse<T>` 사용 (M3에 포함됨)                               |
| **구글 콘솔 설정 누락**                     | M2-B 시작하자마자 리디렉션 오류                                        | M2-A 진행 중에 미리 준비                                           |
| **Tailwind 4 + shadcn 조합 이슈**           | 스타일이 적용 안 되거나 테마 변수가 안 먹음                            | M4에서 팔레트를 먼저 확정하고 넘어감                               |
| **Tiptap SSR 오류** (`PRD` RISK-2)          | hydration mismatch                                                     | 클라이언트 컴포넌트 + `immediatelyRender: false`                   |
| **컨텍스트 오염**                           | 세션이 길어지며 Claude Code가 규칙을 잊음                              | 마일스톤마다 `/clear` 후 `PRD.md`·`API_SPEC.md` 를 다시 읽힌다     |
| **범위 확장**                               | 요청하지 않은 기능이 생성됨                                            | `PRD.md` 4.2 제외 범위를 근거로 되돌림                             |
| **평문 자격증명 커밋** (`PRD` RISK-3)       | `application.properties` 에 DB 비밀번호가 그대로 있음                  | M0 에서 `application-local.properties` 분리 + `.gitignore` (즉시)  |
| **스키마명 표기 불일치** (`PRD` RISK-4)     | 런타임에 스키마를 못 찾거나 테이블이 엉뚱한 스키마에 생성됨            | 전부 소문자 `todolist_db` 로 통일 (`PRD.md` 8.3). M1 착수 전       |
| **가이드의 토큰 저장 예시** (`PRD` RISK-5)  | `saveToken()`·`accessToken` 을 따라 구현해 NFR-S02 위반                | 가이드를 쿠키 방식으로 수정 완료. 충돌 시 `PRD.md` FR-A06 우선     |

### 롤백 원칙

각 마일스톤 완료 시 태그를 남긴다. 다음 마일스톤에서 코드가 엉키면
직전 태그로 되돌린 뒤 프롬프트를 더 잘게 쪼개어 재시도한다. 엉킨 상태 위에 계속 쌓지 않는다.

---

## 7. v1.1 — AWS 배포

**선행**: v1.0 태그
**PRD 관련**: OQ-1

작업 순서

1. **도메인 구성 결정** — httpOnly 쿠키를 쓰므로 프론트·백엔드를 같은 상위 도메인 아래 두는 것을 권장
   (`app.example.com` ↔ `api.example.com`). 완전히 다른 도메인이면 `SameSite=None; Secure` 필요
2. RDS PostgreSQL 인스턴스 생성, 보안그룹 구성
3. `ddl-auto`를 `validate`로 전환, 스키마 관리 방식 확정
4. EC2에 jar 배포 (systemd 서비스 등록), HTTPS 적용
5. Amplify에 프론트 배포, 환경변수 설정
6. 구글 콘솔에 운영 리디렉션 URI 추가
7. 운영 환경 스모크 테스트 — 가입부터 삭제까지 전 과정

**완료 조건**: 외부 URL에서 가입·구글 로그인·Todo CRUD 전 과정 동작, HTTPS 적용, 시크릿이 코드에 없음

---

## 8. v2.0 후보 (우선순위 미확정)

착수 전 별도 PRD를 작성한다.

| 후보                  | 근거                         | 구현 비용                 |
| --------------------- | ---------------------------- | ------------------------- |
| 휴지통 (삭제 복구)    | Soft Delete 기반이 이미 있음 | **낮음 — 가장 먼저 검토** |
| 카테고리 / 태그       | 할 일이 늘면 필터만으로 부족 | 보통                      |
| 하위 작업(체크리스트) | 큰 작업 분할 수요            | 보통                      |
| 드래그 앤 드롭 정렬   | 순서 컬럼 추가 필요          | 보통                      |
| 마감일 알림           | 스케줄러·발송 채널 필요      | 높음                      |
| 반복 일정             | 데이터 모델 변경 큼          | 높음                      |
| 이미지 첨부           | S3 연동 (`PRD` OQ-4)         | 높음                      |
| 회원 탈퇴 UI          | `PRD` OQ-3                   | 낮음                      |
| 비밀번호 재설정       | 메일 발송 인프라 필요        | 높음                      |

---

## 9. 진행 현황

| 마일스톤         | 상태    | 태그               | 비고                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------- | ------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M0 스캐폴딩      | ✅ 완료 | `m0-scaffold`      | DoD 전 항목 통과 (health 200, FE build/secretlint 통과, 자격증명 분리 완료)                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| M1 도메인        | ✅ 완료 |                    | DoD 통과 (`./mvnw verify` 성공, schema.sql 부분 유니크·복합 인덱스 생성 확인). 커밋·`git tag m1-domain`은 미실행                                                                                                                                                                                                                                                                                                                                                                                            |
| M2-A 자체 JWT    | ✅ 완료 | `m2a-jwt-auth`     | DoD 전 항목 curl 검증 통과(가입→로그인→me→로그아웃 후 401, 중복 이메일/짧은 비밀번호 에러 형식 일치, BCrypt 해시는 로그인 성공으로 간접 확인). `./mvnw verify` 성공. `git tag`·커밋은 별도 진행                                                                                                                                                                                                                                                                                                             |
| M2-B 구글 OAuth2 | ✅ 완료 | `m2b-google-oauth` | DoD 전 항목 브라우저 검증 통과(구글 로그인→access_token 쿠키 발급→리다이렉트, 같은 이메일 LOCAL 계정 중복 생성 없이 연결, 동의 취소 시 `/login?error=oauth` 복귀). `./mvnw verify` 성공                                                                                                                                                                                                                                                                                                                     |
| M3 Todo API      | ✅ 완료 | `m3-todo-api`      | DoD 전 항목 curl 검증 통과(생성 시 `<script>` sanitize 제거, 목록 페이지네이션/completed 필터/keyword 검색, 수정·토글·삭제, 삭제 후 404 및 목록 제외, 타 사용자 접근 시 404). `./mvnw verify` 성공(테스트 50개)                                                                                                                                                                                                                                                                                             |
| M4 프론트 기반   | ✅ 완료 | `m4-frontend-base` | DoD 전 항목 통과(`tsc --noEmit`·`lint:strict`·`format:check`·`build`). Playwright로 실브라우저 검증 — 테마 토글 클릭 시 `light`↔`dark` 전환 및 새로고침 후 유지, `proxy.ts`가 쿠키 없는 `/todos` 접근을 `/login`으로 리다이렉트하고 쿠키 있으면 통과시킴을 확인                                                                                                                                                                                                                                             |
| M5 화면 구현     | ✅ 완료 | `m5-ui-complete`   | DoD 전 항목 Playwright 브라우저 검증 통과(가입→로그인→생성/수정/토글/삭제, 토글·삭제 낙관적 업데이트가 응답 전 즉시 반영되고 네트워크 인터셉트로 강제 실패시켜 롤백 확인, 타인 소유 `/todos/[id]` 접근 시 HTTP 404 실측, 320/768px 레이아웃·다크모드 가독성·`focus-visible` 링 확인). 리뷰 중 PRD US-2 누락(로그인 상태로 `/login`·`/signup` 접근 시 `/todos` 미리다이렉트)과 `TiptapViewer`의 `role="textbox"` 접근성 문제를 발견해 즉시 수정. `npm run check`·`npm run build` 통과. `git tag`는 별도 진행 |
| M6 테스트·검증   | ☐ 대기  |                    |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **v1.0 릴리스**  | ☐       |                    |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| v1.1 AWS 배포    | ☐ 대기  |                    |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

> 마일스톤을 끝낼 때마다 이 표를 갱신한다.
