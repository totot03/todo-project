# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 저장소 구조 — 모노레포가 아니다

**독립된 Git 저장소 3개**가 디렉터리로만 중첩되어 있다. 서브모듈도 워크트리도 npm workspaces도 아니다.

| 경로                          | 역할                                    |
| ----------------------------- | --------------------------------------- |
| `todo-project/`               | 루트. `docs/`와 Claude Code 설정만 관리 |
| `todo-project/todo-frontend/` | Next.js 앱. 자체 `.git`                 |
| `todo-project/todo-backend/`  | Spring Boot 앱. 자체 `.git`             |

결과적으로 다음이 **저장소마다 삼중화**되어 있고, 의도된 중복이다:

- `core.hooksPath`가 저장소별로 적용되므로 Git 훅 스택이 3벌
- `.editorconfig`, `commitlint.config.mjs`는 루트/프론트가 동일 내용으로 복제됨
- CI 워크플로는 각 서브 저장소 안에 있다 (`todo-frontend/.github/workflows/`, `todo-backend/.github/workflows/`)

루트 `.gitignore`가 `todo-frontend/`와 `todo-backend/`를 제외하므로 루트 `git status`에는 두 디렉터리가 뜨지 않는다. 무시하지 않으면 임베디드 저장소(gitlink)로 잡혀 내용 없이 경로만 커밋된다.

`cd`한 위치에 따라 어느 저장소를 커밋하는지 달라진다. 파일을 수정한 뒤에는 그 파일이 속한 저장소에서 커밋한다.

`.metadata/`는 Eclipse/STS 워크스페이스 잔여물이며 gitignore 대상이다. 읽지 말고 무시한다.

## 명령어

루트 `package.json`의 스크립트는 대부분 `npm --prefix todo-frontend`로 위임하는 얇은 래퍼다. **프론트엔드만 커버하며 Java와 루트 문서는 포함하지 않는다.**

```bash
# 프론트엔드 (todo-frontend/)
npm run check          # typecheck + lint:strict + format:check — 커밋 전 기본 검증
npm run lint:strict    # eslint --max-warnings=0 (CI·pre-push와 동일 기준)

# 백엔드 (todo-backend/)
./mvnw spotless:apply  # Java 자동 포맷
./mvnw verify          # spotless:check + compile + test
./mvnw spring-boot:run # 개발 서버

# 루트 문서/설정 (todo-frontend 제외, .prettierignore가 통째로 제외함)
npx prettier --write .
```

전체를 한 번에 검증하려면 `/check-all` 스킬을 쓴다. 세 갈래를 모두 도는 단일 npm 스크립트는 없다.

- 루트 `npm run be:verify`는 `mvnw.cmd`를 하드코딩하므로 **Windows 전용**이다. 이식성이 필요하면 `./mvnw`를 직접 부른다.
- Spotless는 Maven `validate` 페이즈에 묶여 있어 **포맷이 어긋나면 `mvn test`/`verify`가 실패한다**. 테스트 실패로 오해하지 말 것.

## 포매터 관할 구역

| 대상                              | 도구                                     | 설정                                |
| --------------------------------- | ---------------------------------------- | ----------------------------------- |
| `todo-frontend/**`                | Prettier + `prettier-plugin-tailwindcss` | `todo-frontend/prettier.config.mjs` |
| `todo-frontend` 밖 문서·설정      | Prettier (플러그인 없음)                 | 루트 `prettier.config.mjs`          |
| `todo-backend/**.java`, `pom.xml` | Spotless / google-java-format **AOSP**   | `todo-backend/pom.xml`              |

ESLint 플랫 설정에서 `eslint-config-prettier`는 **반드시 배열 마지막**에 온다. 포맷은 Prettier가, 코드 품질은 ESLint가 전담한다. 이 경계를 무너뜨리면 저장할 때마다 diff가 요동친다.

## 코드 스타일 (기본값과 다른 것만)

- `printWidth: 100`, `trailingComma: "all"`, `singleQuote: false`, `endOfLine: "lf"`
- 들여쓰기 2칸. 단 `*.java`와 `*.{xml,pom}`은 4칸
- `*.md`는 `trim_trailing_whitespace = false` — 줄 끝 공백 2칸이 줄바꿈으로 의미가 있다
- Tailwind는 **v4 CSS-first**라 `tailwind.config.js`가 없다. 토큰은 `todo-frontend/app/globals.css`에 있다
- `cn`, `cva` 호출 안의 클래스 문자열도 Tailwind 플러그인이 정렬한다
- **프론트엔드에 `src/` 디렉터리가 없다.** `app/`, `components/`, `lib/`, `hooks/`, `providers/`, `types/`가 `todo-frontend/` 바로 아래에 온다. 외부 예제의 `src/`는 걷어내고 읽을 것
- import 별칭은 `@/*` → `todo-frontend/` 루트 **하나뿐**이다. `../../` 상대 경로 금지. `components.json`의 별칭은 shadcn CLI가 파일을 놓을 위치일 뿐 import 별칭이 아니다
- 파일명 kebab-case 선호, 컴포넌트는 PascalCase. snake_case·전체소문자 금지. named export 기본, default export는 page 컴포넌트만
- 주석·문서·커밋 메시지는 **한국어**, 식별자는 영어. 이 저장소의 설정 파일들은 전부 한국어로 주석이 달려 있으니 같은 밀도로 맞춘다

## 불변 규칙 (어기면 API 계약이 깨진다)

전문은 `docs/API_SPEC.md`와 `docs/PRD.md` §8에 있다.

**인증은 httpOnly 쿠키 전용.**

- `Authorization: Bearer` 헤더를 **사용하지 않는다**. 응답 본문에 토큰 값이 **절대** 포함되지 않는다
- 프론트엔드는 토큰을 저장·조회·첨부하지 않는다. `fetch`에 `credentials: "include"` 한 줄이 전부다. `lib/auth/token.ts` 같은 파일을 만들지 말 것
- 로그인 상태는 `GET /api/auth/me`로 판정한다. Access Token 24시간, Refresh Token 없음

**응답 봉투.** 모든 응답은 `ApiResponse<T>`로 감싼다.

```json
{ "success": true,  "data": {},   "error": null }
{ "success": false, "data": null, "error": { "code": "...", "message": "...", "fieldErrors": [...] } }
```

`fieldErrors`는 400 검증 실패에서만 채우고 그 외에는 `null`. `message`는 사용자에게 그대로 보여줄 한국어 문장이다. 스택 트레이스·내부 예외 메시지·SQL을 절대 넣지 않는다.

**Soft Delete.** 물리 삭제 금지, `deleted_at` 기록. **모든 조회는 `deleted_at IS NULL`을 포함한다.** 이메일 유일성은 일반 UNIQUE가 아니라 부분 인덱스 `UNIQUE (email) WHERE deleted_at IS NULL`로 건다 — 탈퇴 계정의 이메일로 재가입이 가능해야 하기 때문이다.

**페이지네이션.** Spring `Page`를 그대로 직렬화하지 말고 `PageResponse<T>`로 변환한다. **`page`는 0-based**이고 UI는 1-based이므로 변환이 필요하다. 정렬은 `createdAt,desc` 고정이며 프론트엔드는 `sort` 파라미터를 쓰지 않는다. 전체 로드 후 메모리 페이징 금지.

**에러 코드.** `VALIDATION_FAILED`(400) · `EMAIL_DUPLICATED`(400) · `LOGIN_FAILED`(401) · `UNAUTHORIZED`(401) · `TODO_NOT_FOUND`(404) · `INTERNAL_ERROR`(500). `LOGIN_FAILED`와 `TODO_NOT_FOUND`는 **의도적으로 원인을 구분하지 않는다** (열거 공격 방지).

**소유권 검증.** `/api/todos/{id}` 계열 쿼리에는 항상 `userId` 조건을 넣고, 불일치 시 **403이 아니라 404**를 반환한다. 리소스 존재 여부가 새면 안 된다.

**기타.** BCrypt·비밀번호 6자 이상 · 닉네임 50자 · 제목 200자 · 마감일은 과거여도 허용(의도된 동작) · 우선순위 `HIGH|MEDIUM|LOW` 기본 `MEDIUM` · 리치 텍스트 본문은 저장 전 서버에서 sanitize · 엔티티를 DTO 대신 노출하지 않음 · CORS는 `http://localhost:3000`을 명시 허용하고 `allowCredentials: true`, **와일드카드 금지**.

## 커밋

형식: `<이모지(선택)> <타입>(<스코프>): <한국어 설명>`

- 타입(강제): `feat` `fix` `docs` `style` `refactor` `perf` `test` `build` `ci` `chore` `revert`
- 스코프(경고만): `fe` `be` `docs` `infra` `deps` `config` `root`
- **헤더 72자 제한** (기본값 100이 아니다 — 한글 표시 폭 때문)
- 제목 끝에 마침표 금지. 본문/푸터 앞에는 빈 줄
- 한국어 제목은 규약이지만 `subject-case`가 꺼져 있어 기계적으로 강제되지는 않는다
- **커밋에 Claude 서명(`Co-Authored-By`, `Generated with` 등)을 절대 추가하지 않는다.** 이 프로젝트 규칙이 상위 기본값보다 우선한다

커밋 작성은 `/commit` 슬래시 커맨드를 쓴다.

## 커밋·푸시 게이트

| 저장소        | pre-commit                                                     | commit-msg          | pre-push                    |
| ------------- | -------------------------------------------------------------- | ------------------- | --------------------------- |
| 루트          | secretlint(스테이징) → lint-staged                             | `commitlint --edit` | FE typecheck + lint         |
| todo-frontend | secretlint(스테이징) → lint-staged                             | `commitlint --edit` | `typecheck` + `lint:strict` |
| todo-backend  | 정규식 시크릿 grep → `spotless:check`(`.java` 스테이징 시에만) | 셸 정규식 검증      | `./mvnw verify`             |

백엔드는 Node에 의존하지 않으려고 `.githooks/`의 순수 셸 스크립트를 쓴다. 훅 설치는 프론트/루트가 `npm install`의 `prepare: husky`, 백엔드가 Maven `initialize` 페이즈의 git-build-hook 플러그인으로 자동화되어 있다.

`--no-verify`로 우회할 수 있지만, 그 경우 CI가 유일한 방어선이다.

## 함정

- **DB 스키마명은 전체 소문자 `todolist_db`.** PostgreSQL이 따옴표 없는 식별자를 소문자로 접기 때문에 `TodoListDB`로 적으면 설정과 실제 스키마가 어긋난다. 데이터베이스는 `postgres`, 테스트 스키마는 `todolist_test_db`
- **`todo-backend/src/main/resources/application.properties`에 평문 DB 비밀번호가 있다.** `.gitignore`는 `application-local.*`만 제외하므로 현재 상태로 커밋하면 유출된다. 백엔드 시크릿 grep은 8자 이상만 잡아 이 값을 통과시킨다 (`docs/PRD.md` RISK-3, 우선순위 "즉시")
- **Flyway/Liquibase가 없다.** 스키마는 `spring.jpa.hibernate.ddl-auto=update`로 만들어진다. 마이그레이션 파일을 찾지 말 것
- **Spring Boot 4에서 `spring-boot-starter-web`이 `-webmvc`로 이름이 바뀌었다.** 테스트 스타터도 `spring-boot-starter-<모듈>-test` 형태다
- **`docs/PRD.md` §1.3의 "설치 상태" 열을 먼저 확인한다.** TanStack Query·next-themes·React Hook Form·Zod·Tiptap·Framer Motion·jsoup·springdoc은 **아직 설치되지 않았다.** 미설치 라이브러리를 import하지 않는다 (과거 에이전트가 설치 여부를 환각한 이력이 있어 이 열이 생겼다)
- **`todo-frontend/AGENTS.md`는 `next dev`가 자동 생성·복원한다.** diff에서 지워도 다시 생기므로 작업물과 함께 커밋한다. `todo-frontend/CLAUDE.md`는 이 파일을 `@AGENTS.md`로 불러오는 한 줄짜리다
- 포트: 백엔드 8080, 프론트엔드 3000
- `CLAUDE_HOOK_ESLINT=1`을 설정하면 편집 시 포맷 훅이 `eslint --fix`까지 돌린다. ESLint 기동이 4초 넘어 기본은 꺼져 있다
- `.mcp.json`의 shrimp-task-manager는 `D:\claude\...` 절대 경로에 묶여 있어 다른 머신에서는 동작하지 않는다

## 문서

**`docs/PRD.md`가 단일 진실 공급원이다.** 다른 문서나 에이전트 프롬프트와 충돌하면 언제나 PRD가 이기고, 나머지를 PRD에 맞춰 고친다.

읽어야 할 시점:

| 문서                                                    | 언제                                                 |
| ------------------------------------------------------- | ---------------------------------------------------- |
| `docs/PRD.md`                                           | 요구사항·스택 사실·불변 규칙·DB 스키마를 확인할 때   |
| `docs/API_SPEC.md`                                      | 엔드포인트를 추가·수정하기 전에 (FE↔BE 계약)         |
| `docs/ROADMAP.md`                                       | 마일스톤(M0, M1, M2-A, M2-B, M3~M6) 범위와 진행 상태 |
| `docs/DEV_TOOLING.md`                                   | 툴링 설정을 바꾸기 전에 (각 선택의 근거가 적혀 있다) |
| `docs/guides/project-structure.md`                      | 프론트엔드에 새 파일·폴더를 만들기 전에              |
| `docs/guides/nextjs-16.md`                              | Next.js 16 파괴적 변경(비동기 `params` 등)을 다룰 때 |
| `docs/guides/styling-guide.md`, `component-patterns.md` | UI 컴포넌트를 작성할 때                              |
| `docs/guides/forms-react-hook-form.md`                  | 폼 작업 시 (해당 라이브러리는 M5에서 설치 예정)      |

**범위 밖(구현하지 않음):** Kakao 등 Google 외 소셜 로그인 · Refresh Token · 비밀번호 재설정 · 이메일 인증 · 계정 삭제 UI · 정렬 UI · 관리자 페이지 · 공유/댓글/태그/첨부/알림 · 다국어(한국어 전용) · AWS 배포 · Docker.
