# Phase 프롬프트 문서 재설계

## Context

사용자가 붙여넣은 "Claude Code 단계별 프롬프트"(Phase 0~~6)는 **프로젝트 착수 전에 작성된 문서**다. 그런데 저장소는 이미 M0~~M6를 끝내고 v1.0 릴리스 판정까지 통과한 상태다. 그 결과 문서의 서술이 실제 산출물과 여러 지점에서 어긋난다 — 패키지명, Spring Boot 버전과 스타터 이름, `src/` 유무, `next-themes` 존치 여부, 정렬 파라미터 정책, 파일 경로 등.

더 큰 문제는 **누락**이다. 이 프로젝트를 실제로 지탱하는 두 축이 Phase 문서에 통째로 없다:

1. `docs/PRD.md`(단일 진실 공급원) → `API_SPEC.md` → `ROADMAP.md` 3단 문서 체계
2. 독립 저장소 3개에 각각 걸린 훅·CI·시크릿 스캔 스택 (`DEV_TOOLING.md`)

Phase 0이 곧바로 코드 생성으로 진입하기 때문에, 이 문서만 보고 프로젝트를 다시 만들면 지금의 저장소가 재현되지 않는다.

또 탐색 중 **역방향 오염**이 확인됐다. 최신 커밋 `4cac461`이 FR-T06을 개정해 정렬 방향 UI를 허용했고 `components/todo/TodoSortToggle.tsx`가 실제로 존재하는데, `CLAUDE.md`는 아직 "프론트엔드는 `sort`를 쓰지 않는다 / 정렬 UI는 범위 밖"이라고 말한다. 다음 세션의 에이전트가 기존 기능을 범위 위반으로 오판할 수 있다.

**목표**: 실제 저장소 사실에 맞춘 Phase 프롬프트 정정판을 `docs/PHASE_PROMPTS.md`로 남기고, 발견된 문서 불일치 2건을 바로잡는다.

---

## 산출물 1 — `docs/PHASE_PROMPTS.md` (신규)

한국어. 구성은 원본의 "Phase 번호 + 붙여넣을 프롬프트 + 완료 조건" 형태를 유지하되, 각 Phase에 **정정 근거**를 덧붙인다. 문서 서두에 ROADMAP 마일스톤 대응표를 둔다.

| Phase 문서           | ROADMAP     | 원본 대비 상태          |
| -------------------- | ----------- | ----------------------- |
| Phase D (문서)       | (선행)      | **신규**                |
| Phase 0-A (툴체인)   | M0          | **신규**                |
| Phase 0-B (스캐폴딩) | M0          | 정정                    |
| Phase 1              | M1          | 정정                    |
| Phase 2-A / 2-B      | M2-A / M2-B | 정정                    |
| Phase 3              | M3          | 정정 (FR-T06 개정 반영) |
| Phase 4              | M4          | 정정 (테마 구현 교체)   |
| Phase 5              | M5          | 정정 (화면 구성 확정판) |
| Phase 6              | M6          | 정정                    |

### 각 Phase에 반영할 정정 내용

#### Phase D — 문서 확정 (신규)

`docs/PRD.md` → `docs/API_SPEC.md` → `docs/ROADMAP.md` 순으로 확정한 뒤에야 코드에 들어간다는 점을 명시. PRD가 단일 진실 공급원이고 충돌 시 PRD가 이긴다는 규칙, 그리고 PRD §1.3 "설치 상태" 열이 스택 사실의 유일한 출처라는 점(과거 에이전트가 설치 여부를 환각한 이력 때문에 생긴 열)을 프롬프트에 넣는다.

#### Phase 0-A — 저장소 구조·툴체인 (신규)

원본에 `git init` 한 줄뿐인 자리를 대체한다.

- **독립 Git 저장소 3개**(루트 / `todo-frontend` / `todo-backend`). 루트 `.gitignore`가 하위 두 디렉터리를 제외하지 않으면 gitlink로 잡혀 경로만 커밋된다 — 실제 루트 `.gitignore` 8~13행에 그 근거 주석이 있다
- 저장소별 훅 스택: 루트·프론트는 husky + lint-staged + commitlint + secretlint, 백엔드는 `.githooks/` 순수 셸 + Spotless (`DEV_TOOLING.md` 2장 표)
- Prettier 관할 분리(루트는 플러그인 없음 / 프론트는 `prettier-plugin-tailwindcss`), `eslint-config-prettier`는 배열 마지막
- CI 워크플로는 각 서브 저장소 안(`todo-frontend/.github/workflows/ci.yml`, `todo-backend/.github/workflows/ci.yml`)
- 커밋 규약: `<이모지> <타입>(<스코프>): <한국어 설명>`, **헤더 72자**, **Claude 서명 금지**

#### Phase 0-B — 스캐폴딩 & DB (원본 Phase 0 정정)

| 원본 서술                                          | 정정                                                                                                                                                                                         |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spring Boot `4.0.7`                                | `4.1.1` (`pom.xml:7`)                                                                                                                                                                        |
| 패키지 `com.example.todoapp`, `TodoAppApplication` | `com.example`, `TodoBackendApplication.java`                                                                                                                                                 |
| 의존성 `web`                                       | **`spring-boot-starter-webmvc`** — Spring Boot 4에서 개명. 테스트도 `spring-boot-starter-<모듈>-test` 형태로 쪼개짐(`spring-boot-starter-webmvc-test` 등, `pom.xml:83~103`)                  |
| 의존성 목록                                        | `jjwt` 3종(api/impl/jackson, 0.12.6)·`jsoup` 누락 — 스택 표에는 있음                                                                                                                         |
| create-next-app `src 디렉터리`                     | **`src/` 없음.** `app/`·`components/`·`lib/`·`hooks/`·`providers/`·`types/`가 `todo-frontend/` 바로 아래                                                                                     |
| `next-themes` 설치                                 | 설치하지 않는다. Phase 4에서 자체 `ThemeProvider` 구현                                                                                                                                       |
| `psql -c "CREATE DATABASE todolist_db"`            | **데이터베이스는 `postgres`, `todolist_db`는 스키마.** `todolist_test_db`도 함께 생성. 전부 소문자(PRD RISK-4)                                                                               |
| `.gitignore` 항목                                  | `application-local.properties` 누락 — 시크릿 분리가 M0의 핵심 DoD(RISK-3 / NFR-S03)                                                                                                          |
| `GET /api/health`                                  | 응답이 `ApiResponse` 봉투 형식이어야 한다는 조건 추가                                                                                                                                        |
| `.env.local` / `.env.example`                      | **현재 저장소에 둘 다 없다.** `NEXT_PUBLIC_API_BASE_URL`이 `client.ts:7`에서 `http://localhost:8080`으로 폴백되고 있어 온보딩 문서가 비어 있다 → `.env.example`만 생성하도록 프롬프트에 명시 |

DoD에 `npm run secretlint` 통과를 추가한다.

#### Phase 1 — 도메인

- 스키마 정의 출처를 `CLAUDE.md`가 아니라 **`PRD.md` §8.2**로 교체
- `schema-index.sql` → 실제 파일명 **`schema.sql`**. 내용도 부분 유니크 인덱스 하나가 아니라 3개다: `ux_users_email_active`, `ix_todos_user_deleted`, `ix_todos_user_completed_deleted` (NFR-P02)
- "적용 방법을 README에" → 실제로는 설정으로 자동 적용된다. `spring.jpa.defer-datasource-initialization=true` + `spring.sql.init.mode=always` 조합(`application.properties:45~46`)이 있어야 Hibernate가 테이블을 만든 뒤 `schema.sql`이 실행된다. 이 순서 보장이 프롬프트에 반드시 들어가야 한다
- `@SQLRestriction` 지적은 원본이 정확 — 유지

#### Phase 2-A — JWT 인증

- 응답 계약을 `ErrorResponse` 중심에서 **`ApiResponse<T>` 봉투**로 교정 (`API_SPEC.md` §1.3~1.5). 실제 클래스는 `common/response/`의 `ApiResponse`·`ErrorResponse`·`FieldError` 3종
- **에러 코드 6종을 프롬프트에 표로 박는다**: `VALIDATION_FAILED`·`EMAIL_DUPLICATED`(400) / `LOGIN_FAILED`·`UNAUTHORIZED`(401) / `TODO_NOT_FOUND`(404) / `INTERNAL_ERROR`(500)
- **`LOGIN_FAILED`와 `TODO_NOT_FOUND`는 원인을 구분하지 않는다**(열거 공격 방지) — 불변 규칙인데 원본에 없다
- `JwtAuthenticationEntryPoint` 누락 — 401도 같은 봉투로 나가야 한다
- 쿠키 속성을 한곳에 모으는 `AccessTokenCookieWriter` 패턴 명시 (HttpOnly·SameSite·Path·Max-Age)
- 제약값 명시: 비밀번호 6자 이상, 닉네임 50자, 제목 200자

#### Phase 2-B — 구글 OAuth2

- "리디렉션 URI를 알려줘"를 **확정값으로 교체**: `http://localhost:8080/login/oauth2/code/google` (`application.properties:24` 주석에 이미 적혀 있다)
- **성공 리다이렉트 대상이 원본과 다르다.** 원본은 `${APP_FRONTEND_URL}/todos`라고 했지만 실제는 `app.oauth2.success-redirect-uri` → `http://localhost:3000/oauth2/callback` 경유 화면이다(PRD §7의 7개 경로 중 하나). 프로퍼티명도 `APP_FRONTEND_URL`이 아니라 `app.oauth2.success-redirect-uri` / `failure-redirect-uri`
- 실패 시 원인을 구분하지 않고 항상 같은 경로로 보낸다는 규칙 추가

#### Phase 3 — Todo API

- **FR-T06 개정 반영**: `sort`는 `createdAt,desc|asc` **두 값만 화이트리스트 허용**, 그 외는 기본값으로 대체. 정렬 필드는 `createdAt` 고정 (`API_SPEC.md` §3.1, PRD:178)
- **소유권 불일치 시 403이 아니라 404** — 원본에 명시 없음
- `PATCH /api/todos/{id}/toggle`이 본문에 없고 검증 조건에만 등장 → 엔드포인트 목록에 추가
- sanitize 허용 태그 출처를 "CLAUDE.md 6장" → **`API_SPEC.md` §3.2**로 교체
- 부분 수정 시 "필드 미전달"과 "빈 문자열"을 구분해야 한다는 점 추가 — 실제 구현에 `common/validation/NullOrNotBlank`가 이 목적으로 존재한다

#### Phase 4 — 프론트 공통 기반

- **`next-themes` 전면 삭제.** M6에서 제거됐다. React 19가 next-themes의 FOUC 방지 스크립트를 컴포넌트 트리 안 엘리먼트로 인식해 경고를 내는 문제(pacocoursey/next-themes#385) 때문에 `providers/ThemeProvider.tsx`의 `useServerInsertedHTML` 기반 자체 구현으로 교체 (PRD §1.3:61)
- **401 처리 위치 교정.** 원본은 "401이면 `/login`으로 보냄"이라고 했지만, `apiFetch`는 Server Component와 브라우저 양쪽에서 호출되어 `window.location`을 쓸 수 없다. 전체 페이지 진입 차단은 `proxy.ts`, 세션 중간 만료 UX는 화면 계층 — `client.ts:51~54` 주석이 근거
- 누락 파일 추가: `lib/api/errors.ts`, `lib/api/server.ts`(Node 런타임은 `credentials:"include"`가 무효라 Cookie 헤더 수동 전달), `lib/query-keys.ts`
- `proxy.ts`(Next.js 16에서 `middleware.ts` 개명) 서술은 원본이 정확 — `guides/nextjs-16.md` 참조 링크만 추가
- import 별칭은 `@/*` 하나뿐, `../../` 금지

#### Phase 5 — 화면 구현

- **화면 구성이 확정 사양과 다르다.** 원본의 "인라인 수정 또는 다이얼로그 수정"은 오답이다. PRD §7이 `/todos/new`와 `/todos/[id]`를 **별도 페이지**로 확정했고, 이유는 `[id]` URL이 있어야 FR-T13(타인 리소스 404)을 URL 레벨에서 검증할 수 있기 때문이다
- 누락 경로 추가: `/` 랜딩(로그인 시 `/todos` 리다이렉트), `/oauth2/callback`(쿠키는 백엔드가 이미 심었으므로 토큰을 받거나 저장하지 않는다)
- 구글 버튼 URL 하드코딩 → `client.ts`가 export하는 `BASE_URL` 재사용(이중 정의 방지)
- **US-2 누락 보강**: 로그인 상태로 `/login`·`/signup` 접근 시 `/todos`로 리다이렉트 — M5 리뷰에서 실제로 빠졌다가 발견된 항목
- 접근성(FR-U08) 추가: `focus-visible` 링, 뷰어에 `role="textbox"`를 붙이지 않을 것(M5에서 수정된 실제 결함)
- DoD에 `npm run check` 추가

#### Phase 6 — 통합 테스트·최종 검증

- **`src/test/resources/application-test.properties` → 실제 위치는 `src/main/resources/`**
- 시나리오 출처를 "CLAUDE.md 11장" → **`PRD.md` §12 + ROADMAP M6**으로 교체. 항목도 7개가 아니라 11개이고, 원본에 없는 **FR-A12(탈퇴 이메일 재가입)** 검증이 포함된다
- 검증 명령 교체:
  - `npm run lint` → **`npm run lint:strict`** (`--max-warnings=0`, CI·pre-push와 동일 기준)
  - `npx tsc --noEmit` → **`npm run typecheck`** (`next typegen`을 먼저 돌린다 — 이걸 빼서 M6에서 CI가 계속 실패했던 실제 이력이 있다)
  - `./mvnw clean test` → **`./mvnw verify`** (Spotless가 `validate` 페이즈에 묶여 있어 포맷이 어긋나면 테스트 실패로 오인된다)
  - `npm run secretlint` 추가
- **구글 로그인은 자동 검증 불가** — 실제 계정이 필요하므로 사용자 수동 확인 항목으로 분리 (PRD §12에 이미 그렇게 표기됨)

### 문서 끝에 넣을 "운영 규칙" 절

- 마일스톤마다 `/clear` 후 `PRD.md`·`API_SPEC.md` 재로딩 (ROADMAP §6 "컨텍스트 오염" 대응)
- 커밋은 **파일이 속한 저장소에서** — `cd` 위치에 따라 대상이 달라진다
- 마일스톤 종료 시 태그(`m0-scaffold` … `v1.0.0`)
- curl뿐 아니라 **Playwright MCP 실브라우저 검증** — M4·M5의 DoD를 실제로 그렇게 통과시켰다
- 전체 검증은 `/check-all` 스킬 (세 갈래를 도는 단일 npm 스크립트는 없다)

---

## 산출물 2 — 기존 문서 불일치 정정

### `CLAUDE.md`

- **93행** — "정렬은 `createdAt,desc` 고정이며 프론트엔드는 `sort` 파라미터를 쓰지 않는다"
  → 정렬 **필드**는 `createdAt` 고정, **방향**은 `createdAt,desc|asc` 화이트리스트로 선택 가능하며 프론트엔드가 `sort`를 보낸다. 근거: PRD:178(FR-T06 개정), `API_SPEC.md` §3.1:255·288, `components/todo/TodoSortToggle.tsx`
- **155행** — 범위 밖 목록에서 "정렬 UI" 제거

### `docs/ROADMAP.md`

- **§9 진행 현황표** M6 행이 `☐ 대기`인데 §3의 M6 항목은 전부 `[x]`, PRD §12도 체크 완료, 커밋 `131d2ce`도 완료를 기록했다 → `✅ 완료`로 갱신하고 DoD 통과 근거(테스트 53개, `./mvnw verify`·`npm run check` 통과, 구글 로그인만 수동 확인 대기)를 비고에 적는다
- v1.0 릴리스 행도 함께 판정 (구글 로그인 수동 확인이 유일한 미결이므로 그 사실을 비고에 남긴다)

---

## 검증

1. `npx prettier --check docs/PHASE_PROMPTS.md docs/ROADMAP.md CLAUDE.md` — 루트 Prettier(플러그인 없음) 기준 통과
2. 새 문서의 모든 파일 경로·행 번호 참조를 실제 파일과 대조 (`schema.sql`, `application.properties`, `client.ts`, `TodoSortToggle.tsx`)
3. `docs/PHASE_PROMPTS.md`의 Phase별 완료 조건이 `ROADMAP.md` 각 마일스톤 DoD와 항목 단위로 일치하는지 교차 확인
4. `CLAUDE.md` 수정 후 정렬 관련 서술이 PRD FR-T06 · API_SPEC §3.1과 모순되지 않는지 재확인
5. 커밋은 **루트 저장소**에서 (`docs/`와 `CLAUDE.md` 모두 루트 소유). 형식 `📝 docs(root): ...`, 헤더 72자 이내, **Claude 서명 없이** — 프로젝트 규칙이 상위 기본값을 덮는다
