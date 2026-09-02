# M6 — 통합 테스트 및 최종 검증 구현 계획

## Context

`docs/ROADMAP.md`의 M0~~M5가 전부 완료 상태이고, 이제 마지막 마일스톤인 M6("통합 테스트 및 최종 검증")을 진행해 `v1.0.0` 릴리스 판정을 통과시켜야 한다. M6의 작업 목록(ROADMAP.md 291~~317줄)은 대부분 **백엔드 통합 테스트**이고, 완료 조건(DoD)은 `./mvnw verify` 통과·`npm run check` 통과·`docs/PRD.md` 12장 릴리스 판정 체크리스트 전 항목 체크다.

조사 결과 두 가지가 확인됐다:

1. **M2-A/M3 단계에서 이미 상당한 테스트 자산이 쌓여 있다.** `AuthControllerTest`·`TodoControllerTest`가 signup→login→me→logout, Todo CRUD 전 과정(생성 sanitize→목록 페이지네이션/필터/검색→상세→수정→토글→타사용자 404 4종→삭제→재삭제 404→쿠키없이 401→검증실패 400)을 이미 MockMvc 통합 테스트로 촘촘히 커버하고 있다. 즉 M6은 "테스트를 처음부터 쓰는" 단계가 아니라 **빈 틈(주로 FR-A12 탈퇴 재가입)을 메우고, `test` 프로필을 확정하고, 릴리스 체크리스트를 전수 검증하는** 단계다.
2. **CI가 두 저장소 모두 이유를 알 수 없는 채로 매번 빨간불이다.** 직접 `gh run list`/`gh run view --log-failed`로 확인한 결과:
   - `todo-backend`: `mvnw`가 실행 비트 없이 커밋되어(`git ls-files -s mvnw` → `100644`) CI에서 `./mvnw: Permission denied`(exit 126)로 Spotless/컴파일/테스트가 시작도 못 하고 죽는다. 로컬(Windows)은 파일시스템이 실행 비트를 신경 쓰지 않아 아무도 눈치채지 못했다.
   - `todo-frontend`: `next.config.ts`의 `typedRoutes: true`가 `LayoutProps<"/">` 같은 전역 타입을 `.next/types/`에 생성하는데, 이는 `next build`/`next dev`/`next typegen`을 한 번 실행해야만 생기는 gitignore 대상 디렉터리다. CI는 클린 체크아웃 직후 `typecheck`(`tsc --noEmit`)부터 실행하므로 `app/layout.tsx(22,50): error TS2304: Cannot find name 'LayoutProps'`로 매번 실패한다. 로컬은 개발자가 이미 `npm run dev`를 돌려놔서 우연히 통과해왔다.

   이 두 결함은 M6 범위(Postgres 서비스 컨테이너 추가 등) 밖의 **선행 결함**이지만, 고치지 않으면 이번에 CI에 추가하는 검증 자체가 통과하는지 확인할 방법이 없다. 그래서 이번 계획의 0번 작업으로 가장 먼저 처리한다.

사용자가 이미 확정한 범위:

- **CI에 Postgres 서비스 컨테이너를 추가**하고 테스트가 `test` 프로필(`todolist_test_db`)로 CI에서도 실제로 통과하도록 만든다.
- **프론트엔드에는 Vitest/Playwright/RTL 등 테스트 프레임워크를 설치하지 않는다.** PRD 12장의 UI 체크리스트 항목(테마 토글·반응형·로딩/에러/빈 상태)은 이미 사용 가능한 Playwright MCP로 **일회성 수동 검증**만 하고 리포지토리에 테스트 코드를 남기지 않는다.

---

## 0. 선행 조치 — CI 블로커 해소 (M6 본작업 전 필수, 별도 커밋)

### 0-1. `todo-backend/mvnw` 실행 비트 복구

```bash
cd todo-backend
git update-index --chmod=+x mvnw
git commit -m "🔧 fix(be): mvnw 실행 권한 복구"
```

Windows에서는 `chmod`가 의미 없으므로 반드시 `git update-index --chmod=+x`로 git이 추적하는 모드 비트를 직접 바꿔야 한다. 커밋 후 `git ls-files -s mvnw`로 `100755`가 됐는지 확인.

### 0-2. `todo-frontend`의 `typecheck` 스크립트에 typegen 선행

`package.json`의 `"typecheck": "tsc --noEmit"`을 `"typecheck": "next typegen && tsc --noEmit"`로 변경. `check` 스크립트는 `typecheck`를 그대로 호출하므로 별도 수정 불필요.

두 수정 모두 각자 저장소에서 독립 커밋 후 푸시해, GitHub Actions에서 최소한 "다음 단계까지는 도달하는지" 먼저 확인한다. 이 시점에는 아직 Postgres 서비스가 없으므로 백엔드 CI는 이번엔 통합 테스트 단계에서 새로운 이유로 실패할 수 있다(정상 — 1~4번에서 해결).

---

## 1. `application-test.properties` 확정

현재 파일(`todo-backend/src/main/resources/application-test.properties`)은 "최소 골격" 상태로 `ddl-auto`가 없다. ROADMAP이 명시한 `create-drop`으로 다음과 같이 완성한다. JWT/구글 OAuth2 값은 테스트 JVM 안에서만 쓰이고 어떤 운영 자산도 보호하지 않는 더미 값이므로 — `SecurityConfigTest`가 검증하는 건 `/oauth2/authorization/google` 리다이렉트 여부뿐, 실제 구글 서버에 검증 요청을 보내지 않는다 — 파일에 직접 기입해도 RISK-3(운영 DB 비밀번호 노출)과는 무관하다.

```properties
# test 프로필 확정판 — M6. spring.profiles.active 로 자동 활성화하지 않는다.
# 테스트 코드의 @ActiveProfiles("test") 로만 활성화된다 (CI도 동일 메커니즘).

# --- Database (PostgreSQL / 스키마: todolist_test_db) ---
spring.datasource.url=jdbc:postgresql://localhost:5432/postgres?currentSchema=todolist_test_db
spring.datasource.username=postgres
spring.datasource.password=${DB_PASSWORD}

# --- JPA / Hibernate ---
spring.jpa.hibernate.ddl-auto=create-drop
spring.jpa.properties.hibernate.default_schema=todolist_test_db
spring.jpa.show-sql=false
spring.jpa.defer-datasource-initialization=true
spring.sql.init.mode=always

# --- JWT (테스트 전용 고정 시크릿 — 운영 자산을 보호하지 않으므로 직접 기입) ---
jwt.secret=test-only-signing-key-never-used-outside-ci-1234567890abcdef
jwt.expiration=86400000

# --- OAuth2 (구글, 더미 값 — 실제 토큰 교환 없이 리다이렉트 경로만 검증됨) ---
spring.security.oauth2.client.registration.google.client-id=test-google-client-id
spring.security.oauth2.client.registration.google.client-secret=test-google-client-secret
spring.security.oauth2.client.registration.google.scope=email,profile
app.oauth2.success-redirect-uri=http://localhost:3000/oauth2/callback
app.oauth2.failure-redirect-uri=http://localhost:3000/login?error=oauth
```

`application.properties`의 실제 키 이름(`jwt.secret`, `app.oauth2.success-redirect-uri` 등)과 정확히 일치하는지 작성 시 대조 확인할 것.

`defer-datasource-initialization=true` + `sql.init.mode=always` 조합이 `create-drop`과 함께 있으면 Hibernate가 테이블을 만든 뒤 `schema.sql`이 실행되므로, `ux_users_email_active` 부분 유니크 인덱스가 테스트 스키마에도 매번 재적용된다 — FR-A12(탈퇴 이메일 재가입) 검증에 필수적인 부분이다.

## 2. 기존 통합 테스트 4개에 `@ActiveProfiles("test")` 적용

대상: `SecurityConfigTest.java`, `AuthControllerTest.java`, `TodoControllerTest.java`, `TodoBackendApplicationTests.java`. 각 클래스 선언 위에 `@ActiveProfiles("test")` 추가(+ `org.springframework.test.context.ActiveProfiles` import).

확인된 사실: 두 테스트 클래스 모두 `System.currentTimeMillis()`로 이메일을 유니크하게 만드는 방식이라 스키마 종류(local의 `update` vs test의 `create-drop`)와 무관하게 동작한다. 로컬 프로필에 대한 하드 의존성 없음.

## 3. 신규/보강 테스트

기존 두 통합 테스트 클래스는 각각 **하나의 순차 플로우 테스트 메서드**(`signupLoginMeLogoutFlowMatchesApiSpec`, `todoCrudFlowMatchesApiSpec`) 안에 대부분의 시나리오를 담는 방식으로 작성되어 있다. 이미 커버된 항목(로그인 성공+쿠키, 토큰없이 401, CRUD 전 과정, 타사용자 404 4종, `<script>` 제거, 검증 실패 400)은 손대지 않고, 빠진 항목만 같은 스타일로 추가한다.

### `AuthControllerTest.java` — 신규 `@Test` 메서드 3개

```java
@Autowired private UserRepository userRepository;

@Test
void signupWithDuplicateEmailReturns400EmailDuplicated() throws Exception {
    // 같은 이메일로 2번 가입 → 2번째는 EMAIL_DUPLICATED(400).
    // 실제 DB의 부분 유니크 인덱스 + AuthService.existsByEmail 조합을 통합 레벨로 검증
    // (AuthServiceTest는 mock repo라 이 경로를 커버하지 못함).
}

@Test
void signupWithInvalidEmailFormatReturns400ValidationFailed() throws Exception {
    // "email":"not-an-email" → 400 VALIDATION_FAILED + fieldErrors 존재.
    // Bean Validation 규칙 자체는 SignupRequestTest(유닛)가 이미 검증하므로,
    // 여기선 컨트롤러가 그 예외를 정확히 ApiResponse 포맷으로 변환하는지만 확인.
}

@Test
void signupSucceedsWithSameEmailAfterPriorAccountIsSoftDeleted() throws Exception {
    // FR-A12. 탈퇴 UI가 없으므로 UserRepository로 직접 soft delete.
    String email = "withdrawn-" + System.currentTimeMillis() + "@example.com";

    // 1) 최초 가입
    mockMvc.perform(post("/api/auth/signup") ... email ...).andExpect(status().isCreated());

    // 2) 리포지토리로 직접 soft delete (findByEmail은 살아있는 시점에 호출)
    User user = userRepository.findByEmail(email).orElseThrow();
    user.markDeleted();
    userRepository.save(user);

    // 3) @SQLRestriction이 걸려 조회에서 사라졌는지 확인
    assertTrue(userRepository.findByEmail(email).isEmpty());

    // 4) 같은 이메일로 재가입 — 부분 유니크 인덱스가 이를 허용해야 한다
    mockMvc.perform(post("/api/auth/signup") ... 같은 email ...)
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.data.email").value(email));
}
```

`User.markDeleted()`(`BaseTimeEntity`에 정의), `User`의 `@SQLRestriction("deleted_at IS NULL")`, `UserRepository.findByEmail` 모두 이미 존재함을 확인했다 — 신규 프로덕션 코드 불필요, 테스트 코드만 추가.

### `TodoControllerTest.java` — 기존 플로우에 어서션 보강

- **2) 목록** 블록에 `jsonPath("$.data.totalPages").isNumber()` 추가 (현재 `page`/`size`/`totalElements`/`first`만 검증, `totalPages` 누락).
- 정렬(`createdAt DESC`) 검증: 두 번째 Todo를 만든 뒤 목록 응답의 `content[0].id`가 가장 최근 생성 항목인지 확인하는 어서션 추가.
- **7) 삭제** 직후, `deleted_at` 컬럼 자체는 API 응답에 없고 `@SQLRestriction` 때문에 일반 리포지토리 조회로도 확인 불가하므로, `@PersistenceContext EntityManager`를 테스트 클래스에 주입해 네이티브 쿼리(`SELECT deleted_at FROM todos WHERE id = :id`)로 `not null`인지 직접 확인하는 보조 어서션 추가. (프로덕션 `TodoRepository`에 테스트 전용 메서드를 얹지 않기 위함.)

---

## 4. CI 워크플로 — Postgres 서비스 컨테이너 추가

`todo-backend/.github/workflows/ci.yml`을 다음과 같이 수정:

```yaml
name: backend-ci

on:
  push:
    branches: [main, master, "feature/**", "fix/**", "dev/**", "hotfix/**"]
  pull_request:

jobs:
  verify:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: postgres
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-java@v4
        with:
          distribution: zulu
          java-version: "21"
          cache: maven

      # todolist_test_db는 Hibernate가 만들지 못하는 "스키마 네임스페이스"라 미리 만들어야 한다.
      - name: 테스트 스키마 생성 (todolist_test_db)
        run: PGPASSWORD=postgres psql -h localhost -U postgres -d postgres -c "CREATE SCHEMA IF NOT EXISTS todolist_test_db;"

      - name: 빌드 + 포맷 검사 + 테스트
        run: ./mvnw --batch-mode verify
        env:
          DB_PASSWORD: postgres
```

**정합성**: GitHub-hosted 러너는 잡이 컨테이너가 아니라 VM에서 직접 실행되므로, `services.postgres`를 포트 매핑(`5432:5432`)하면 러너에서 `localhost:5432`로 그대로 접근 가능하다 — `application-test.properties`의 접속 URL을 바꿀 필요가 없다. `DB_PASSWORD`는 서비스 컨테이너의 `POSTGRES_PASSWORD`와 동일한 값(`postgres`)으로 맞춘다. `-Dspring.profiles.active=test`처럼 Maven에 시스템 프로퍼티를 넘기는 방식은 쓰지 않는다 — 이 프로젝트는 "`@ActiveProfiles`로만 test 프로필을 활성화한다"는 설계를 이미 명시해뒀고, JUnit이 테스트 클래스 어노테이션으로 컨텍스트를 띄우므로 시스템 프로퍼티는 애초에 관여할 경로가 없다.

로컬 개발 환경에도 `todolist_test_db` 스키마가 미리 있어야 하므로(ROADMAP M0에서 만들어졌어야 함), 2번 작업 전에 `psql`로 존재 여부를 확인한다.

---

## 5. `docs/PRD.md` 12장 릴리스 체크리스트 검증 절차

| 구분                               | 항목                                                                                                                                                                             | 검증 방법                                                                                                                                      |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 자동화(로컬+CI)                    | `./mvnw verify`, `npm run check`, `npm run secretlint`, `npm run build`, `npm run typecheck`, `/api/health` 200                                                                  | 각 명령 실행                                                                                                                                   |
| 자동화(테스트 코드로 이미 커버)    | 회원가입/로그인 쿠키·본문에 토큰 없음, 보호엔드포인트 401, CRUD·페이지네이션·필터·검색, Soft Delete `deleted_at`, 타인 리소스 404(API), `<script>` 제거, DB password 컬럼 비평문 | 위 1~3번 반영 후 `./mvnw test` 결과로 확인                                                                                                     |
| 수동(비-DB)                        | 저장소에 평문 자격증명 미커밋                                                                                                                                                    | `git log -p -- application.properties application-local.properties*` (RISK-3은 이미 알려진 별도 이슈, 이번엔 "커밋 여부"만 재확인)             |
| 수동(Playwright MCP)               | 라이트/다크 토글 동작·새로고침 후 유지                                                                                                                                           | `/` 접속 → `ThemeToggle` 클릭 → `<html>` class 변화 확인 → reload 후 유지 확인                                                                 |
| 수동(Playwright MCP)               | 320/768/1280px 레이아웃                                                                                                                                                          | `browser_resize`로 세 크기 각각 `/`, `/todos`, `/todos/[id]`, `/login`, `/signup` 스크린샷, 레이아웃 깨짐 육안 확인                            |
| 수동(Playwright MCP)               | 로딩·에러·빈 상태                                                                                                                                                                | 빈 상태: 신규 계정으로 `/todos` 접속(0건). 에러: 백엔드 중단 후 접속. 컴포넌트(`LoadingSpinner`/`ErrorMessage`/`EmptyState`)는 이미 구현됨     |
| 수동(Playwright MCP)               | 타인 리소스 접근 시 404 (화면)                                                                                                                                                   | 사용자 A로 Todo 생성 → id 확인 → 사용자 B로 재로그인 → `/todos/{A의 id}` 직접 네비게이션 → 404/에러 화면 확인                                  |
| 수동(Playwright MCP, 1회 스크린샷) | Swagger UI 확인                                                                                                                                                                  | springdoc-openapi 3.1.0 이미 설치·배선 완료(`SecurityConfig`가 `/swagger-ui/**` permitAll). `http://localhost:8080/swagger-ui/index.html` 접속 |
| 수동(사람, 자동화 불가)            | 구글 로그인 정상 동작                                                                                                                                                            | 실제 구글 계정 필요. 에이전트가 대신 로그인할 수 없으므로 사용자가 직접 1회 확인하거나 스킵 후 체크리스트에 "수동 확인 완료"로 기록            |
| 구조적 보장(테스트 불필요)         | 완료 토글·삭제 실패 시 롤백                                                                                                                                                      | `@Transactional` 서비스 메서드의 Spring 기본 동작 — 문서화만                                                                                   |

---

## 6. `docs/PRD.md` §1.3 "설치 상태" 표 갱신

사용자가 지목한 3개 프론트 항목 외에, 탐색 중 같은 문제(도입 완료됐는데 표는 "미설치"로 남음)를 가진 백엔드 항목 2개를 추가로 발견했다. 함께 정정한다.

| 행                       | 현재 표기          | 정정                            |
| ------------------------ | ------------------ | ------------------------------- |
| jsoup                    | 미설치 — M3 도입   | 설치됨 (`jsoup.version=1.18.3`) |
| springdoc-openapi        | 미설치 — M2-A 도입 | 설치됨 (3.1.0)                  |
| React Hook Form + Zod    | 미설치 — M5 도입   | 설치됨 (7.87 / 4.5)             |
| Tiptap                   | 미설치 — M5 도입   | 설치됨 (3.30)                   |
| Framer Motion (`motion`) | 미설치 — M5 도입   | 설치됨 (13.1)                   |

## 7. 문서 갱신 및 태그

- `docs/ROADMAP.md` M6의 작업 체크박스 11개 + DoD 3개를 `[x]`로 갱신.
- `docs/PRD.md` §1.3 표 5줄(6번) + 12장 체크리스트 전 항목을 `[x]`로 갱신.
- **태그**: 기존 관행이 `todo-backend`(m0/m1/m2b/m3)·`todo-frontend`(m4/m5)에 마일스톤 태그를 남기고 루트 저장소는 태그 없이 문서 커밋만 하는 방식이었다. M6은 백엔드(CI+테스트)와 프론트엔드(문서+수동 QA) 양쪽에 걸치고 `v1.0.0`은 두 앱 모두의 릴리스이므로, **`todo-backend`와 `todo-frontend` 양쪽에 각각 `git tag v1.0.0`**, 루트는 기존 관행대로 태그 없이 문서 커밋만 남긴다.

---

## 범위에 포함하지 않는 것

- Testcontainers/H2/RestAssured 도입 — 사용자 결정에 따라 실제 PostgreSQL 유지.
- 프론트엔드 Vitest/Playwright 코드 자산화 — 사용자 결정에 따라 Playwright MCP 일회성 수동 검증만.
- RISK-3(`application.properties` 평문 DB 비밀번호) 근본 해결 — 이미 별도로 알려진 이슈이며 M6 체크리스트 항목은 "커밋 여부" 확인일 뿐이라 재작업 불필요.
- 구글 OAuth2 실제 로그인 E2E 자동화 — 실계정 필요, 수동 확인으로 대체.

## 검증

```bash
# 0) 선행 조치 확인
cd todo-backend && git ls-files -s mvnw   # 100755 확인
gh run list --limit 3                     # 두 저장소 모두 CI 통과 확인

# 1~4) 백엔드
cd todo-backend
./mvnw --batch-mode verify

# 5) 프론트엔드
cd todo-frontend
npm run check
npm run secretlint
npm run build

# 전체 (권장): /check-all 스킬로 프론트·백·루트 문서 3영역 한 번에 검증
```

- Playwright MCP로 5번 표의 수동 검증 시나리오 실행(테스트 코드로 남기지 않음, 결과만 체크리스트에 반영).
- 최종적으로 `git log --oneline`으로 커밋이 의도한 저장소·순서대로 쌓였는지, `git tag`로 `v1.0.0`이 `todo-backend`·`todo-frontend` 양쪽에 찍혔는지 확인.

## Critical Files

- `todo-backend/mvnw` (실행 비트)
- `todo-backend/src/main/resources/application-test.properties`
- `todo-backend/src/test/java/com/example/controller/AuthControllerTest.java`
- `todo-backend/src/test/java/com/example/controller/TodoControllerTest.java`
- `todo-backend/src/test/java/com/example/config/SecurityConfigTest.java`
- `todo-backend/src/test/java/com/example/TodoBackendApplicationTests.java`
- `todo-backend/.github/workflows/ci.yml`
- `todo-frontend/package.json` (`typecheck` 스크립트)
- `docs/PRD.md` (§1.3, 12장)
- `docs/ROADMAP.md` (M6 섹션)
