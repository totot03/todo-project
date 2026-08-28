# Todo List 서비스

Spring Boot + Next.js로 구현하는 개인용 할 일 관리 서비스입니다. 이메일/구글 로그인으로 인증하고,
우선순위·마감일·리치 텍스트 설명이 있는 할 일을 만들고 관리할 수 있습니다.

요구사항과 API 계약, 진행 상황의 단일 진실 공급원은 [`docs/`](./docs) 아래 문서입니다 — 아래 "문서 안내" 참고.

## 저장소 구조 — 모노레포가 아니다

**독립된 Git 저장소 3개**가 디렉터리로만 중첩되어 있습니다. 서브모듈도 워크트리도 npm workspaces도 아닙니다.

| 경로             | 역할                                    |
| ---------------- | --------------------------------------- |
| `/`              | 루트. `docs/`와 Claude Code 설정만 관리 |
| `todo-frontend/` | Next.js 앱. 자체 `.git`                 |
| `todo-backend/`  | Spring Boot 앱. 자체 `.git`             |

파일을 수정한 뒤에는 그 파일이 속한 저장소에서 커밋해야 합니다. 자세한 배경은 [`CLAUDE.md`](./CLAUDE.md)를 참고하세요.

## 기술 스택

| 영역       | 스택                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------- |
| 백엔드     | Spring Boot 4.1.1, JDK 21, Spring Data JPA/Hibernate, Spring Security(+OAuth2 Client), PostgreSQL |
| 프론트엔드 | Next.js 16.3.3, React 19, TypeScript, Tailwind CSS 4(CSS-first), shadcn/ui                        |
| 인증       | 이메일/비밀번호(JWT) + 구글 OAuth2, httpOnly 쿠키 기반                                            |

## 로컬 실행

### 사전 준비

- PostgreSQL에 `postgres` 데이터베이스 안에 `todolist_db`, `todolist_test_db` 스키마 생성
- `todo-backend/src/main/resources/application-local.properties`에 로컬 DB 비밀번호 설정 (커밋 금지, `.gitignore` 처리됨)

### 백엔드 (포트 8080)

```bash
cd todo-backend
./mvnw spring-boot:run
```

### 프론트엔드 (포트 3000)

```bash
cd todo-frontend
npm install
npm run dev
```

## 문서 안내

| 문서                  | 용도                                                         |
| --------------------- | ------------------------------------------------------------ |
| `docs/PRD.md`         | **단일 진실 공급원.** 요구사항·기술 스택·불변 규칙·DB 스키마 |
| `docs/API_SPEC.md`    | 프론트엔드-백엔드 API 계약                                   |
| `docs/ROADMAP.md`     | 마일스톤(M0~M6)별 범위와 진행 상태                           |
| `docs/DEV_TOOLING.md` | 품질·보안 도구 설정 근거                                     |
| `docs/guides/`        | 프론트엔드 구현 패턴 가이드                                  |

다른 문서나 설정이 `docs/PRD.md`와 충돌하면 **항상 PRD가 우선**입니다.
