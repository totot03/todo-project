# 개발 도구 가이드 (DEV_TOOLING)

Todo 프로젝트의 코드 품질·보안 도구 구성과 사용법을 정리한 문서입니다.

---

## 1. 저장소 구조 — 왜 설정이 3벌인가

이 프로젝트는 **Git 저장소가 3개**입니다. (모노레포가 아닙니다)

| 경로                         | 저장소      | 성격                                       |
| ---------------------------- | ----------- | ------------------------------------------ |
| `D:\claude\todo-project`     | 루트        | 문서(`docs/`)·Claude Code 설정·MCP 설정    |
| `todo-project\todo-frontend` | 독립 저장소 | Next.js 16 / React 19 / TS 5 / Tailwind v4 |
| `todo-project\todo-backend`  | 독립 저장소 | Spring Boot 4.1.1 / Java 21 / Maven        |

`core.hooksPath`는 **저장소마다 따로** 설정됩니다. 따라서 루트에만 훅을 걸면
프론트·백엔드 커밋에는 아무 검사도 적용되지 않습니다. 그래서 세 저장소 각각에
같은 역할의 방어선을 두었습니다.

```
루트          husky  →  .husky/          (문서·설정 파일 커밋)
todo-frontend husky  →  .husky/          (Node 기반: eslint/prettier/commitlint/secretlint)
todo-backend  순수 셸 →  .githooks/       (Node 없음: grep 시크릿 스캔 + Maven Spotless)
```

---

## 2. 언제 무엇이 실행되는가

검사 비용에 따라 실행 시점을 나눴습니다. **비싼 검사일수록 뒤로** 미룹니다.

| 시점                                               | 프론트엔드                                                               | 백엔드                                | 대략 소요 |
| -------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------- | --------- |
| **파일 편집 직후**<br>(Claude Code PostToolUse 훅) | Prettier 자동 포맷                                                       | —                                     | ~0.5초    |
| **커밋 시**<br>(pre-commit)                        | 시크릿 스캔 → `eslint --fix` → `prettier --write`<br>_스테이징된 파일만_ | 시크릿 grep 스캔 → Spotless 포맷 검사 | 1~10초    |
| **커밋 메시지**<br>(commit-msg)                    | commitlint                                                               | 정규식 검증                           | 즉시      |
| **푸시 시**<br>(pre-push)                          | `tsc --noEmit` + `eslint` _(전체)_                                       | `mvn verify` (컴파일+테스트)          | 20초~1분  |
| **CI**<br>(GitHub Actions)                         | 위 전부 + `next build` + `npm audit`                                     | `mvn verify`                          | 수 분     |

> **타입 체크가 pre-commit 이 아니라 pre-push 인 이유**
> `tsc`는 파일 단위 검사가 불가능합니다. 프로젝트 전체 타입 그래프가 필요하므로
> 스테이징된 일부 파일만 넘기면 오탐이 발생합니다. 그래서 "전체를 봐야 하는 검사"는
> 커밋이 아니라 푸시 시점으로 분리했습니다.

---

## 3. 프론트엔드 (`todo-frontend`)

### 명령어

```bash
npm run dev            # 개발 서버
npm run lint           # ESLint
npm run lint:fix       # ESLint 자동 수정
npm run lint:strict    # 경고도 실패 처리 (CI/pre-push 용)
npm run format         # Prettier 전체 적용
npm run format:check   # Prettier 검사만
npm run typecheck      # tsc --noEmit
npm run secretlint     # 시크릿 스캔
npm run check          # typecheck + lint:strict + format:check (커밋 전 한 번에)
```

### 설정 파일

| 파일                               | 역할                                                                        |
| ---------------------------------- | --------------------------------------------------------------------------- |
| `eslint.config.mjs`                | Flat Config. next → typescript → 프로젝트 규칙 → **prettier(맨 마지막)** 순 |
| `prettier.config.mjs`              | 포맷 단일 출처. Tailwind 클래스 자동 정렬 포함                              |
| `.lintstagedrc.mjs`                | 스테이징 파일에 적용할 명령                                                 |
| `commitlint.config.mjs`            | 커밋 메시지 규칙 (이모지 허용 파서)                                         |
| `.secretlintrc.json`               | 시크릿 탐지 규칙                                                            |
| `.editorconfig` / `.gitattributes` | 들여쓰기·줄바꿈(LF) 고정                                                    |

**ESLint와 Prettier의 역할 분담**: `eslint-config-prettier`를 설정 배열 **맨 마지막**에 두어
포맷 관련 ESLint 규칙을 전부 끕니다. 포맷은 Prettier가, 코드 품질은 ESLint가 단독 담당합니다.
이 순서가 어긋나면 두 도구가 같은 줄을 서로 다르게 고쳐 저장할 때마다 diff가 요동칩니다.

### 추가된 품질·보안 규칙

- `no-console`: 경고 (`console.warn`/`error`는 허용)
- `no-debugger`: 에러
- `@typescript-eslint/no-explicit-any`: 경고
- `@typescript-eslint/consistent-type-imports`: 타입 전용 import 분리 → 번들에 런타임 코드 미포함
- `react/no-danger`: 경고 (XSS 직결)
- `react/jsx-no-target-blank`: 에러 (탭내빙 취약점)
- 미사용 변수는 `_` 접두사로 의도적 미사용 표시 가능

---

## 4. 백엔드 (`todo-backend`)

### 명령어

```bash
./mvnw spotless:apply    # Java 포맷 자동 정리 (프론트의 prettier --write 에 해당)
./mvnw spotless:check    # 포맷 검사만
./mvnw verify            # 포맷 검사 + 컴파일 + 테스트
```

### Spotless (google-java-format, AOSP 스타일)

`validate` 단계에 `spotless:check`가 묶여 있어 `mvn test`/`verify` 시 **포맷 위반이 빌드를 깹니다.**
포맷 외에 미사용 import 제거, import 정렬(`java → jakarta → org → com → 나머지`)도 함께 수행합니다.

`sortPom`이 `pom.xml` 자체도 정규화하므로 pom 수정 시 diff가 안정적으로 유지됩니다.

### 훅 자동 설치

`git-build-hook-maven-plugin`이 빌드의 `initialize` 단계에서
`core.hooksPath = .githooks`를 자동으로 설정합니다.
**클론 후 `./mvnw` 를 한 번이라도 돌리면 훅이 연결됩니다.**

> 훅 기반 품질 관리의 가장 큰 실패 모드는 "새 개발자가 설치를 잊어 조용히 무방비가 되는 것"입니다.
> 이 플러그인이 그 구멍을 막습니다.

---

## 5. 커밋 메시지 규칙

```
<이모지(선택)> <타입>(<범위>): <한국어 설명>
```

예시:

```
✨ feat(fe): 할 일 완료 토글 UI 추가
fix(be): 만료된 JWT 재발급 시 500 응답 수정
📝 docs: 개발 도구 가이드 작성
```

- **타입**: `feat` `fix` `docs` `style` `refactor` `perf` `test` `build` `ci` `chore` `revert`
- **범위(선택)**: `fe` `be` `docs` `infra` `deps` `config` `root`
- **제목 72자 이내**, 마침표 없음, 본문은 빈 줄 하나 뒤에

기본 conventional 파서는 앞의 이모지를 타입으로 인식하지 못해 무조건 실패합니다.
그래서 `commitlint.config.mjs`에서 파서를 확장해 `.claude/commands/git/commit.md`의
이모지 컨벤션과 맞췄습니다.

---

## 6. 시크릿 유출 방지

| 계층        | 도구                          | 범위                                                   |
| ----------- | ----------------------------- | ------------------------------------------------------ |
| 프론트 커밋 | secretlint (preset-recommend) | AWS/GCP/Slack/GitHub 토큰, 개인키 등 알려진 형태       |
| 백엔드 커밋 | 셸 grep 패턴                  | `password:` `secret:` `client-secret` JDBC 인증정보 등 |
| 저장소      | `.gitignore`                  | `.env*`, `*.pem`, `*.key`, `application-local.*`       |
| Claude Code | `permissions.deny`            | Claude가 `.env`·인증서 파일을 **읽는 것 자체를 차단**  |

**한계를 알고 쓰세요.** 두 스캐너 모두 정규식 기반입니다.
`const key = "임의문자열"` 처럼 키 이름 힌트가 없는 형태는 잡지 못합니다.
자격 증명은 코드에 넣지 않는 것이 1차 방어이고, 스캐너는 실수를 잡는 2차 방어입니다.

오탐이면 `git commit --no-verify` 로 우회할 수 있습니다.

---

## 7. Claude Code 안전장치 (`.claude/settings.json`)

**PostToolUse 훅**: Claude가 `todo-frontend` 안의 파일을 편집/생성하면
즉시 Prettier가 적용됩니다 (`.claude/hooks/format-on-edit.mjs`).

- 대상: `todo-frontend` 내부의 코드·스타일·문서 파일만
- 실패해도 작업을 막지 않습니다 (항상 exit 0)
- ESLint `--fix`까지 즉시 원하면 환경변수 `CLAUDE_HOOK_ESLINT=1` 설정
  (기동에 4초 이상 걸려 기본은 꺼둠 — 어차피 pre-commit이 동일한 `--fix`를 수행)

**차단 규칙(`permissions.deny`)**:

```
Bash(rm -rf *)            파일 대량 삭제
Bash(git push --force*)   원격 히스토리 파괴
Bash(git reset --hard*)   로컬 작업 소실
Bash(git clean -fd*)      추적되지 않은 파일 삭제
Bash(npm publish*)        의도치 않은 배포
Read(.env / *.pem / *.key / application-local.*)   시크릿 읽기 자체를 차단
```

---

## 8. 새로 클론했을 때 (온보딩)

```bash
# 프론트엔드
cd todo-frontend
npm install          # prepare 스크립트가 husky 훅을 자동 설치
npm run check        # 검사 통과 확인

# 백엔드
cd ../todo-backend
./mvnw verify        # initialize 단계에서 .githooks 자동 연결
```

두 명령 모두 훅 설치를 **부수 효과로** 포함합니다. 별도 설치 단계가 없습니다.

---

## 9. 훅을 우회해야 할 때

```bash
git commit --no-verify    # pre-commit / commit-msg 건너뜀
git push --no-verify      # pre-push 건너뜀
```

정당한 상황(긴급 핫픽스, 스캐너 오탐)에서만 사용하세요.
같은 검사가 CI에서 다시 실행되므로 우회해도 결국 걸립니다.
