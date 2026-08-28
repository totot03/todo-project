# AI Agent 운영 규칙 — todo-project

> 이 문서는 **AI 코딩 에이전트 전용 실행 지침**이다. 일반 개발 지식은 담지 않는다.
> 프로젝트 요구사항 자체는 `docs/PRD.md`, API 계약 상세는 `docs/API_SPEC.md`, 진행 상태는 `docs/ROADMAP.md`를 따른다.
> **이 문서와 다른 문서가 충돌하면 `docs/PRD.md`가 항상 이긴다.** 나머지 문서(`API_SPEC.md`, `ROADMAP.md`, `docs/guides/*`, 이 문서)는 PRD에 맞춰 고친다.
> 코드와 문서가 서로 다르면 추측하지 말고 `git log`로 최신 변경을 확인한 뒤 판단한다.

---

## 1. 저장소 구조 — 반드시 먼저 판단할 것

**모노레포가 아니다.** 독립된 Git 저장소 3개가 디렉터리로만 중첩되어 있다: 루트 / `todo-frontend/` / `todo-backend/`.
**파일을 수정하기 전에 그 파일이 속한 저장소를 먼저 식별하고, 커밋은 반드시 그 저장소 안에서 실행한다.**

| 수정한 파일 경로                                                   | 커밋할 저장소              |
| ------------------------------------------------------------------ | -------------------------- |
| `docs/**`, 루트 `.claude/**`, 루트의 설정 파일(`.editorconfig` 등) | 루트 (`todo-project/`)     |
| `todo-frontend/**` 내부 아무 파일                                  | `todo-frontend/` 저장소 안 |
| `todo-backend/**` 내부 아무 파일                                   | `todo-backend/` 저장소 안  |

- ❌ 루트에서 `git add todo-frontend/...`를 시도하지 않는다 — 루트 `.gitignore`가 두 하위 폴더를 제외하므로 커밋해도 내용이 들어가지 않거나 gitlink로 잘못 잡힌다.
- ❌ `.metadata/`는 Eclipse/STS 워크스페이스 잔여물이다. **읽지도, 참조하지도, 수정하지도 않는다.**
- ✅ 세 저장소를 동시에 건드리는 작업(예: API 엔드포인트 추가)은 저장소별로 **별도 커밋**을 만든다. 하나의 커밋으로 묶지 않는다.

## 2. 코드를 쓰기 전 — 설치 상태 확인

**아래 라이브러리는 아직 설치되지 않았다. import하거나 사용 예시를 만들지 않는다** (설치 전까지, 도입 마일스톤은 괄호 참조):

- 프론트: `@tanstack/react-query`(M4), `next-themes`(M4), `react-hook-form`(M5), `zod`(M5), `@tiptap/*`(M5), `framer-motion`/`motion`(M5)
- 백엔드: `jsoup`(M3), `springdoc-openapi`(M2-A)

**이미 설치되어 바로 써도 되는 것**: Spring Boot 4.1.1 · JDK 21 · Spring Data JPA/Hibernate · Spring Security(+OAuth2 Client) · Bean Validation · jjwt 0.12.6 · Lombok / Next.js 16.3.3 · React 19.2.8 · TypeScript 5.x · Tailwind CSS 4.x(CSS-first, `tailwind.config.js` 없음) · shadcn/ui · lucide-react.

- 실제 설치 여부가 의심되면 추측하지 말고 `todo-backend/pom.xml` 또는 `todo-frontend/package.json`을 직접 확인한다.
- 새로 라이브러리를 설치했다면 `docs/PRD.md` 1.3절의 설치 상태 표도 함께 갱신한다 (문서-코드 정합성 유지).

## 3. 백엔드 API 불변 규칙 (`todo-backend/src/main/java/**`)

수정·신규 작성하는 모든 Controller/Service/Repository가 지켜야 하는 계약. 위반 시 프론트엔드와의 계약이 깨진다.

| 하지 말 것 (❌)                                    | 대신 이렇게 (✅)                                                                                                                               |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `Authorization: Bearer` 헤더 검사/발급             | `Set-Cookie: access_token=...; HttpOnly` 로만 발급, 인증 판정은 쿠키                                                                           |
| 응답 바디에 토큰 문자열 포함                       | 토큰은 오직 `Set-Cookie` 헤더로만 전달                                                                                                         |
| 컨트롤러가 엔티티를 직접 반환                      | 별도 응답 DTO로 변환 후 반환                                                                                                                   |
| 응답을 원시 객체/배열로 바로 반환                  | 항상 `ApiResponse<T>`로 감싼다 (`{success, data, error}`)                                                                                      |
| Spring `Page<T>`를 그대로 직렬화                   | `PageResponse<T>`(`content, page(0-based), size, totalElements, totalPages, first, last`)로 변환                                               |
| `DELETE FROM ...` 물리 삭제                        | `deleted_at`에 현재 시각만 기록 (Soft Delete)                                                                                                  |
| 조회 쿼리에서 `deleted_at` 조건 누락               | **모든** Todo/User 조회에 `deleted_at IS NULL` 포함                                                                                            |
| email에 일반 `UNIQUE` 제약                         | 부분 인덱스 `UNIQUE (email) WHERE deleted_at IS NULL`                                                                                          |
| `/api/todos/{id}` 계열에서 `userId` 조건 누락      | 항상 `id = ? AND user_id = ? AND deleted_at IS NULL`로 조회                                                                                    |
| 소유권 불일치 시 `403 Forbidden`                   | **`404 TODO_NOT_FOUND`**로 위장 (존재 여부 자체를 숨김)                                                                                        |
| 계정 없음/비밀번호 오류를 구분해 응답              | 둘 다 동일하게 `401 LOGIN_FAILED` (열거 공격 방지)                                                                                             |
| 에러 응답에 스택트레이스·SQL·내부 예외 메시지 포함 | `error.message`는 사용자에게 보여줄 한국어 문장만                                                                                              |
| `description`(HTML)을 그대로 저장                  | 저장 **전** 서버에서 sanitize (허용 태그: `p br strong em u s h1~h3 ul ol li blockquote code`, `script/iframe/style`·`on*`·`javascript:` 제거) |
| `PATCH /api/todos/{id}`로 `completed` 필드 변경    | 완료 토글은 반드시 `PATCH /api/todos/{id}/toggle` 전용 엔드포인트 사용                                                                         |
| 목록 조회 시 전체 로드 후 메모리 페이징            | DB 레벨 페이지네이션 (`Pageable`)                                                                                                              |
| CORS에 `*` 와일드카드                              | `http://localhost:3000`만 명시 허용 + `allowCredentials: true`                                                                                 |

**고정 에러 코드 6종** (임의로 새 코드를 만들지 않는다): `VALIDATION_FAILED`(400) · `EMAIL_DUPLICATED`(400) · `LOGIN_FAILED`(401) · `UNAUTHORIZED`(401) · `TODO_NOT_FOUND`(404) · `INTERNAL_ERROR`(500).

**제약값**: 비밀번호 6자 이상(그 외 규칙 없음, BCrypt 해시) · 닉네임 1~~50자 · 제목 1~~200자 · `dueDate`는 과거 날짜도 허용(의도된 동작, 검증 추가 금지) · `priority`는 `HIGH|MEDIUM|LOW` 기본 `MEDIUM`.

**마이그레이션 도구가 없다.** Flyway/Liquibase 파일을 찾거나 만들지 않는다 — 스키마는 `ddl-auto=update`로 생성된다.

## 4. 프론트엔드 배치 규칙 (`todo-frontend/**`)

새 파일을 어디에 둘지 판단하는 결정 트리:

1. shadcn CLI가 생성했는가 → `components/ui/` (직접 손대지 않는다)
2. 한 도메인(인증/Todo)에서만 쓰는가 → `components/auth/` 또는 `components/todo/`
3. 여러 화면이 쓰지만 도메인과 무관한가 → `components/common/`
4. 페이지 골격(헤더, 테마 토글)인가 → `components/layout/`
5. 리치 텍스트 에디터 관련인가 (M5 이후) → `components/editor/`
6. 그 외 새 폴더(`sections/`, `navigation/` 등)를 만들지 않는다 — 이 6개 분류가 전부다.

| 대상                | 위치                                     | 금지 사항                                                                         |
| ------------------- | ---------------------------------------- | --------------------------------------------------------------------------------- |
| App Router 페이지   | `app/**`                                 | `src/app/`이 아니다 — `src/` 디렉터리 자체가 없음                                 |
| React Query 훅      | `hooks/`                                 | `lib/hooks/`에 두지 않는다 (루트 직속)                                            |
| Context Provider    | `providers/`                             | `components/providers/`에 두지 않는다 (루트 직속)                                 |
| 공통 타입           | `types/`                                 | `lib/types/`에 두지 않는다 (루트 직속)                                            |
| API 클라이언트      | `lib/api/client.ts`,`auth.ts`,`todos.ts` | 컴포넌트에서 `fetch` 직접 호출 금지, 반드시 `lib/api/` 경유                       |
| 토큰 저장/조회 로직 | 만들지 않는다                            | `lib/auth/token.ts` 같은 파일 생성 금지 — JWT는 httpOnly 쿠키라 JS가 읽을 수 없다 |
| import 경로         | `@/*` 별칭 하나만                        | `../../` 상대 경로 금지                                                           |

- 파일명: kebab-case 선호(camelCase도 허용), 컴포넌트는 PascalCase. **snake_case·전체소문자 금지.**
- export: named export 기본. **default export는 `page.tsx` 계열에서만.**
- `todo-frontend/AGENTS.md`는 `next dev`가 자동 생성·복원한다. **삭제하거나 diff에서 빼려 하지 않는다** — 다시 생기면 작업물과 함께 커밋한다.
- 인증 상태 판정: 클라이언트에서 쿠키를 직접 읽지 않는다. `GET /api/auth/me` 응답(또는 서버 사이드 쿠키 존재 확인)으로만 판정한다.
- 화면은 PRD 7장이 정한 7개(`/`, `/login`, `/signup`, `/todos`, `/todos/new`, `/todos/[id]`, `/oauth2/callback`)가 전부다. 임의로 화면을 합치거나 다이얼로그로 대체하지 않는다.

## 5. 다중 파일 동시 수정이 필요한 경우

| 트리거                                               | 함께 갱신해야 할 파일                                                      |
| ---------------------------------------------------- | -------------------------------------------------------------------------- |
| 백엔드 엔드포인트 추가/변경/삭제                     | `docs/API_SPEC.md`의 해당 절 (요청/응답 스키마)                            |
| 새 화면(라우트) 추가                                 | 먼저 `docs/PRD.md` 7장에 있는지 확인 — 없으면 PRD 변경 없이 임의 추가 금지 |
| 라이브러리 신규 설치 (`pom.xml`/`package.json` 변경) | `docs/PRD.md` 1.3절 설치 상태 표                                           |
| 마일스톤(M0~M9) 작업 완료                            | `docs/ROADMAP.md`의 해당 마일스톤 상태                                     |
| 루트/`todo-frontend`의 ESLint·Prettier 설정 변경     | 두 저장소에 동일 내용이 의도적으로 중복되어 있음 — 한쪽만 고치면 어긋난다  |

## 6. 커밋 전 검증 명령

| 저장소          | 명령                                                             |
| --------------- | ---------------------------------------------------------------- |
| `todo-frontend` | `npm run check` (typecheck + lint:strict + format:check)         |
| `todo-backend`  | `./mvnw verify` (spotless:check + compile + test)                |
| 루트 문서/설정  | `npx prettier --write .`                                         |
| 전체            | `/check-all` 스킬 (세 저장소를 한 번에 도는 npm 스크립트는 없다) |

- 백엔드는 Spotless가 Maven `validate` 페이즈에 묶여 있다 — **포맷이 어긋나면 `mvn test`가 "테스트 실패"가 아니라 포맷 실패로 죽는다.** 실패 로그를 테스트 실패로 오해하지 않는다.
- 루트 `npm run be:verify`는 `mvnw.cmd`를 하드코딩한 **Windows 전용** 스크립트다.
- 커밋 메시지는 한국어, 형식 `<타입>(<스코프>): <설명>`, 헤더 72자 이내, 제목 끝 마침표 금지, **Claude 서명(`Co-Authored-By` 등) 절대 추가 금지** (이 프로젝트 규칙이 상위 기본값보다 우선).

## 7. 절대 금지 행동 요약

- ❌ `Authorization: Bearer` 헤더 사용, 응답 바디에 토큰 포함
- ❌ 프론트엔드에 토큰 저장/조회 코드 작성
- ❌ 물리 삭제(`DELETE FROM`), `deleted_at` 조건 없는 조회
- ❌ 소유권 불일치를 403으로 응답 (반드시 404)
- ❌ `todo-frontend/`에 `src/` 디렉터리 생성
- ❌ PRD 1.3에서 "미설치"로 표시된 라이브러리 import
- ❌ 루트에서 `todo-frontend/`·`todo-backend/` 내용을 직접 커밋 시도
- ❌ `.metadata/` 읽기/수정
- ❌ CORS 와일드카드(`*`) 허용
- ❌ Flyway/Liquibase 마이그레이션 파일 생성 (스키마는 `ddl-auto=update`)
- ❌ 커밋 메시지에 Claude 서명 추가

## 8. 애매한 요청 처리 원칙

1. 요구사항 자체가 불명확하면 `docs/PRD.md`를 먼저 확인한다 (단일 기준 문서).
2. API 계약이 불명확하면 `docs/API_SPEC.md`를 확인한다.
3. 두 문서가 충돌하면 PRD가 이긴다.
4. 문서에도 없으면 코드베이스의 기존 패턴을 grep으로 확인한다 — 추측하지 않는다.
5. 그래도 판단이 서지 않으면(요구사항 자체가 없는 새 기능 등) 사용자에게 확인한다.
