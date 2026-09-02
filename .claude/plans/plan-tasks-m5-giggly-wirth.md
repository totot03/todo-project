# M5 작업물 커밋

## Context

M5(화면 구현 및 연동) 구현과 검증이 끝났고, 사용자가 "현재까지의 내용을 커밋해줘"라고 요청했다. 저장소 3개 중 실제 변경이 있는 곳은 `todo-frontend`(M5 구현)와 루트(`docs/ROADMAP.md` 진행 상황 갱신) 두 곳이다. `todo-backend`는 이번 세션에서 손대지 않아 커밋 대상이 아니다.

`git status`로 확인한 실제 변경 파일:

- **`todo-frontend`**: 수정 7개(`app/globals.css`, `app/layout.tsx`, `app/page.tsx`, `lib/api/client.ts`, `next.config.ts`, `package.json`, `package-lock.json`) + 신규 25개(디렉터리 단위로 `app/login/`, `app/not-found.tsx`, `app/oauth2/`, `app/signup/`, `app/todos/`, `components/auth/`, `components/common/{ConfirmDialog,NotFoundState}.tsx`, `components/editor/`, `components/layout/AuthMenu.tsx`, `components/todo/`, `components/ui/{badge,card,checkbox,dialog,form,input,label,select,separator}.tsx`, `hooks/`, `lib/api/{errors,server}.ts`, `lib/query-keys.ts`, `lib/schemas/`)
- **루트**: `docs/ROADMAP.md` 수정(M5 체크리스트·진행 현황 표를 완료로 갱신)
- **커밋 대상 아님**: 루트의 `.claude/plans/*.md`(계획 파일, 이전 마일스톤 것들도 미커밋 상태로 남아 있음 — 이번 요청 범위 밖), `.playwright-mcp/`·루트의 스크린샷 PNG들(브라우저 검증 중 생성된 산출물), `image.png`(세션 시작 전부터 있던 미상 파일)

## 커밋 분할

전부 스테이징된 파일이 없으므로(`git diff --cached` 비어 있음) `git status` 기준으로 새로 스테이징한다. `todo-frontend`는 한 마일스톤(M5) 전체가 서로 강하게 의존하는 하나의 완결된 기능(스키마→훅→컴포넌트→페이지가 서로를 참조)이므로, 억지로 잘게 쪼개면 중간 커밋이 타입체크·빌드가 깨진 상태가 된다. 두 개의 논리 단위로 나눈다:

1. **`todo-frontend` — 패키지·공통 기반**: `package.json`/`package-lock.json`(react-hook-form/zod/@hookform/resolvers/@tiptap/\*/motion 설치), `next.config.ts`(typedRoutes), `lib/api/client.ts`(headers 옵션, BASE_URL export), `lib/api/{errors,server}.ts`, `lib/query-keys.ts`, `lib/schemas/`, `hooks/`, `components/ui/*`(shadcn 추가분), `components/editor/`, `app/globals.css`(Tiptap 스타일 블록)
   - 메시지: `✨ feat(fe): M5 폼·에디터·낙관적 업데이트 공통 기반 추가`
2. **`todo-frontend` — 화면 7종**: `app/page.tsx`(랜딩 재작성), `app/layout.tsx`(Header+AuthMenu 통합), `app/login/`, `app/signup/`, `app/oauth2/`, `app/todos/`, `app/not-found.tsx`, `components/auth/`, `components/layout/AuthMenu.tsx`, `components/todo/`, `components/common/{ConfirmDialog,NotFoundState}.tsx`
   - 메시지: `✨ feat(fe): 인증·할 일 CRUD 화면 7종 구현 및 연동`
3. **루트 — 문서**: `docs/ROADMAP.md`
   - 메시지: `📝 docs(root): M5 화면 구현 완료 체크`

세 커밋 모두 Claude 서명(`Co-Authored-By` 등)을 추가하지 않는다(프로젝트 규칙).

## 실행 순서

1. `todo-frontend`에서 1번 그룹 파일만 `git add` → 커밋
2. `todo-frontend`에서 나머지(2번 그룹, 남은 전부) `git add` → 커밋
3. 루트에서 `docs/ROADMAP.md`만 `git add` → 커밋
4. 각 커밋 후 `git log --oneline -1`로 결과 확인. `todo-frontend`는 이번 커밋 후 `git status --short`가 비어야 한다(스크린샷·플랜 파일은 루트 쪽이라 무관)

## 검증

- 각 저장소에서 `git status --short`로 의도한 파일만 스테이징됐는지 커밋 직전에 재확인
- 커밋 후 `git log --oneline -3`으로 메시지 형식(이모지+타입+한국어 설명, 72자 이내) 확인
- pre-commit 훅(secretlint·lint-staged)이 통과하는지 커밋 실행 결과로 확인 — 실패하면 훅 출력 그대로 보고
