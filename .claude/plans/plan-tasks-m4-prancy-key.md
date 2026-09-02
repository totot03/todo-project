# M4 — 커밋 · 태깅 · 완료 표시 계획

## Context

M4 "프론트엔드 공통 기반" 구현은 이전 세션에서 완료되어 `todo-frontend` 저장소의 `feature/m4-frontend-base` 브랜치(작업 브랜치는 세션 안전 규칙에 따라 생성)에 미커밋 상태로 존재한다. `npx tsc --noEmit`, `lint:strict`, `format:check`, `npm run build` 전부 통과했고, 실제 브라우저(Playwright)로 테마 토글 유지와 `proxy.ts`의 `/todos` 라우트 보호까지 검증을 마쳤다.

이번 작업은 코드 작성이 아니라 **(1) todo-frontend의 변경사항을 원자적 커밋으로 분할·커밋 (2) `main`에 병합 후 `git tag m4-frontend-base` (3) 루트 저장소 `docs/ROADMAP.md`에서 M4를 완료로 표시**하는 세 단계다. `todo-frontend`와 루트는 독립된 Git 저장소이므로 커밋도 저장소별로 따로 이뤄진다.

### 저장소별 커밋 관례 (실제 히스토리 조사로 확인)

- **`todo-frontend`**: 최근 7개 커밋 전부 `<타입>(fe): <한국어 설명>` 형식이며 **이모지를 쓰지 않는다**(CLAUDE.md는 이모지를 "선택"으로 두지만, 이 저장소의 실제 관례는 일관되게 생략). 스코프는 항상 `fe`.
- **루트 저장소**: M1·M2-A/M2-B·M3 "완료 체크" 커밋(`e58da42`, `ce9472b`, `216100a`) 세 건 모두 `📝 docs(root): <설명>` 형식을 정확히 따르고, **별도 브랜치 없이 `main`에 직접 커밋**됐다(두 저장소 모두 히스토리가 완전히 선형이라 feature 브랜치 자체가 이 프로젝트에서 드물게 쓰인다). 이번 루트 저장소 작업(문서 전용, 저위험)도 이 선례를 그대로 따른다.
- 완료 체크 커밋은 항상 두 곳을 같이 갱신한다: ① 해당 마일스톤 섹션의 작업 체크박스 `[ ]`→`[x]` ② 9장 진행 현황표의 상태·태그·비고 칸. 비고에는 어떤 방식으로 DoD를 검증했는지 구체적으로 남긴다(216100a 사례 참고).
- `.claude/plans/*.md` 계획 파일들은 과거 M2-B·M3 완료 시점에도 커밋되지 않고 untracked로 남아있었다(확인됨) — 이번에도 커밋 대상에 포함하지 않는다.

## todo-frontend — 커밋 분할

의존성 순서(빌드 가능성 기준)로 7개 커밋으로 나눈다. `components/common/*`은 이번 diff의 다른 어떤 파일에서도 아직 import되지 않는 완전 독립 컴포넌트라 `components/layout/*`(실제로 `app/page.tsx`에 연결되어 동작)과 성격이 달라 분리한다.

| #   | 커밋 메시지                                                         | 포함 파일                                                                                      |
| --- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 1   | `build(fe): TanStack Query, next-themes 의존성 추가`                | `package.json`, `package-lock.json`                                                            |
| 2   | `feat(fe): API 응답 타입 및 클라이언트 계층 추가`                   | `types/api.ts`, `lib/api/client.ts`, `lib/api/auth.ts`, `lib/api/todos.ts`                     |
| 3   | `feat(fe): QueryProvider, ThemeProvider 추가`                       | `providers/QueryProvider.tsx`, `providers/ThemeProvider.tsx`                                   |
| 4   | `feat(fe): 공통 UI 컴포넌트 추가`                                   | `components/common/EmptyState.tsx`, `ErrorMessage.tsx`, `LoadingSpinner.tsx`, `Pagination.tsx` |
| 5   | `feat(fe): 헤더 및 테마 토글 컴포넌트 추가`                         | `components/layout/Header.tsx`, `components/layout/ThemeToggle.tsx`                            |
| 6   | `feat(fe): 루트 레이아웃에 Provider 연결, 홈 화면 placeholder 교체` | `app/layout.tsx`, `app/page.tsx`                                                               |
| 7   | `feat(fe): /todos 인증 프록시 추가`                                 | `proxy.ts`                                                                                     |

각 커밋은 `git add <해당 파일들>` → `git commit -m "..."` (헤더만, 본문 없이 — 과거 `bf5a93e` 등 단순 기능 추가 커밋들도 본문 없이 헤더 한 줄로 끝남).

## todo-frontend — 병합 · 태깅

```powershell
git checkout main
git merge feature/m4-frontend-base --ff-only   # 선형 히스토리이므로 fast-forward 가능
git branch -d feature/m4-frontend-base
git tag m4-frontend-base                        # ROADMAP.md M4 체크포인트 규정과 일치
```

`--ff-only`를 쓰는 이유: `main`이 이 세션 동안 다른 커밋으로 진행되지 않았으므로 fast-forward가 항상 가능해야 하고, 만약 안 된다면(예상 밖의 외부 변경) merge commit을 만들기 전에 원인을 먼저 확인해야 한다.

**push는 하지 않는다** — 사용자가 커밋·태깅·완료 표시만 요청했고, 원격 반영은 별도 요청 시 진행한다.

## 루트 저장소 — docs/ROADMAP.md 완료 체크

`main`에서 직접 커밋(선례와 동일). `docs/ROADMAP.md`에서:

1. M4 섹션의 작업 체크박스 10개(패키지 설치 / `types/api.ts` / `lib/api/client.ts` / `lib/api/auth.ts,todos.ts` / `providers/QueryProvider.tsx` / `providers/ThemeProvider.tsx` / `Header.tsx,ThemeToggle.tsx` / `Pagination.tsx` / `LoadingSpinner,ErrorMessage,EmptyState` / `proxy.ts`)를 전부 `[x]`로.
2. 9장 진행 현황표의 M4 행: 상태 `☐ 대기` → `✅ 완료`, 태그 칸에 `` `m4-frontend-base` ``, 비고에 실제 검증 내용을 216100a 사례 수준으로 구체적으로 서술(예: "DoD 전 항목 통과 — tsc/lint:strict/format:check/build, Playwright로 테마 토글+새로고침 유지 및 proxy.ts 리다이렉트 실브라우저 검증").

커밋: `📝 docs(root): M4 프론트엔드 공통 기반 완료 체크`

## 루트 저장소 — docs/PRD.md 설치 상태 갱신

과거 3건의 완료 체크 커밋에는 없던 케이스이지만, `docs/PRD.md` §1.3 "설치 상태" 표는 CLAUDE.md가 "과거 에이전트가 설치 여부를 환각한 이력이 있어 생겼다"고 명시한, 정확성이 중요한 표다. `@tanstack/react-query`, `next-themes` 행을 "미설치 — M4 도입" → "설치됨"으로 갱신하지 않으면 이 표 자체가 이제 사실과 어긋난다. 관심사가 다르므로(마일스톤 진행 상태 vs 스택 사실) ROADMAP 커밋과 분리한다.

커밋: `📝 docs(root): PRD 설치 상태에 TanStack Query·next-themes 반영`

## 검증

- 각 커밋 후 `git log --oneline -8`(todo-frontend), `git status`로 스테이징 누락 없는지 확인.
- 병합 후 `git log --oneline --graph -10`으로 fast-forward가 선형으로 반영됐는지 확인, `git tag` 로 `m4-frontend-base` 존재 확인.
- 루트 저장소 커밋 후 `git show --stat`으로 의도한 파일만 바뀌었는지 확인(과거 3건처럼 단일 파일 diff여야 함, 단 이번엔 ROADMAP.md·PRD.md 2개 커밋으로 분리).
- 모든 커밋 메시지에 Claude 서명이 없는지 최종 확인(프로젝트 규칙).

## Critical Files

- `todo-frontend/`(7개 커밋 대상 파일 전체)
- `docs/ROADMAP.md`
- `docs/PRD.md`
