# 3개 저장소(root / todo-backend / todo-frontend) 초기 커밋 정리

## Context

`todo-project`, `todo-backend`, `todo-frontend`는 서로 다른 `.git`을 가진 독립 저장소 3개다 (CLAUDE.md "저장소 구조" 참고). 세 저장소 모두 지금까지 작업물이 커밋되지 않은 상태이며(root·backend는 아직 첫 커밋조차 없음), 각각 GitHub 원격(`totot03/todo-project`, `totot03/todo-backend`, `totot03/todo-frontend`)에 연결되어 있다.

조사 중 `todo-backend/src/main/resources/application.properties`에 평문 DB 비밀번호(`qaz123`)가 들어있는 것을 확인했다. CLAUDE.md가 이미 "함정"으로 문서화한 RISK-3 항목이며, pre-commit 훅의 시크릿 정규식이 8자 이상만 검사해 이 값(6자)을 통과시킨다. 저장소가 공개 GitHub 원격에 연결돼 있어 그대로 커밋하면 실제로 유출된다. 사용자에게 확인한 결과 **환경변수로 분리 후 커밋**하기로 결정했다 — `application.properties`의 비밀번호 값을 `${DB_PASSWORD}` 플레이스홀더로 바꾸고, 실제 값이나 힌트는 파일/커밋 어디에도 남기지 않는다 (주석에 값을 적으면 분리하는 의미가 없어지므로).

CLAUDE.md 커밋 규칙에 따라 "작은 단위로 나눠서" 커밋하고, 타입/스코프 컨벤션(`<타입>(<스코프>): <한국어 설명>`, 헤더 72자, 마침표 금지, Claude 서명 금지)을 지킨다. **push는 하지 않는다** — 사용자는 "커밋 처리"만 요청했다.

## 실행 전 준비 작업 (backend)

`todo-backend/src/main/resources/application.properties`의 아래 줄만 수정:

```properties
spring.datasource.password=qaz123
```

→

```properties
spring.datasource.password=${DB_PASSWORD}
```

값이나 힌트를 주석으로 남기지 않는다. 커밋 후 사용자에게 로컬 실행 시 `DB_PASSWORD` 환경변수를 직접 설정해야 한다고 안내한다.

## 커밋 계획

### 1. root (`todo-project/`)

첫 커밋이 없는 상태 — 아래 4개로 분리:

1. `chore(root): Git 훅·포맷·커밋 규칙 도구 설정 추가`
   `.gitignore .gitattributes .editorconfig .husky/ .lintstagedrc.mjs .secretlintrc.json commitlint.config.mjs prettier.config.mjs package.json package-lock.json`
2. `chore(config): MCP 서버 설정 추가`
   `.mcp.json`
3. `chore(root): Claude Code 에이전트·커맨드·스킬 설정 추가`
   `.claude/` (`.claude/settings.local.json`은 루트 `.gitignore`가 이미 제외)
4. `docs(docs): PRD·API 명세·로드맵·개발 가이드 문서 추가`
   `docs/ CLAUDE.md`

### 2. todo-backend (`todo-project/todo-backend/`)

첫 커밋이 없는 상태 — 아래 4개로 분리:

1. `chore(be): Maven Wrapper 및 프로젝트 메타 설정 추가`
   `.mvn/ mvnw mvnw.cmd pom.xml .gitignore .editorconfig .gitattributes`
2. `chore(be): 커밋 검증·시크릿 스캔 Git 훅 스크립트 추가`
   `.githooks/`
3. `ci(be): GitHub Actions CI 워크플로 추가`
   `.github/`
4. `feat(be): Spring Boot 애플리케이션 초기 구조 추가`
   `src/` (위에서 수정한 `application.properties` 포함)

### 3. todo-frontend (`todo-project/todo-frontend/`)

`f0287f1 Initial commit from Create Next App` 위에 쌓는 작업 — 아래 6개로 분리:

1. `build(fe): shadcn/ui 및 개발 도구 의존성 추가`
   `package.json package-lock.json`
2. `chore(fe): ESLint/Prettier/커밋 검증 도구 설정 추가`
   `eslint.config.mjs .editorconfig .gitattributes .prettierignore prettier.config.mjs commitlint.config.mjs .lintstagedrc.mjs .secretlintrc.json .husky/`
3. `style(fe): Prettier 포맷 일괄 적용`
   `next.config.ts app/layout.tsx app/page.tsx` (로직 변경 없음 — 클래스 순서·줄바꿈만 Prettier 규칙대로 정리됨을 diff로 확인함)
4. `ci(fe): GitHub Actions CI 워크플로 추가`
   `.github/`
5. `chore(fe): VS Code 에디터 설정 추가`
   `.vscode/`
6. `feat(fe): shadcn/ui 초기화 및 button 컴포넌트 추가`
   `components.json components/ lib/ app/globals.css` (globals.css는 shadcn init이 생성한 테마 토큰)

## 실행 방식

각 저장소 디렉터리로 이동해 위 그룹 단위로 `git add <경로...>` → `git commit -m "..."`을 순서대로 실행한다. `.claude/commands/git/commit.md`(`/commit` 스킬)를 쓰지 않고 직접 `git commit`을 실행하는 이유는 이미 그룹과 메시지가 확정돼 있고 파일 단위 그룹핑이 필요해서다.

## 검증

- 각 저장소에서 `git status --short` → 미커밋 변경 없음 확인
- 각 저장소에서 `git log --oneline` → 계획한 커밋 개수·순서 확인
- `git show <backend feat 커밋>:src/main/resources/application.properties` → `qaz123` 문자열이 어디에도 없는지 확인
- `git log -p --all | grep -i qaz123` (backend) → 히스토리 전체에서 실제 비밀번호 값이 한 번도 등장하지 않는지 최종 확인
