# M3 Todo CRUD API 구현물 커밋 계획

## Context

직전 대화에서 M3(Todo CRUD API) 구현을 마쳤고 `./mvnw verify`(포맷+컴파일+테스트 50개)와 실제 서버 curl 검증까지 끝났다. `todo-backend` 저장소에는 아직 커밋되지 않은 변경 사항이 남아있고, 사용자가 `/commit`으로 이를 커밋해 달라고 요청했다. 이 계획은 "무엇을 구현할지"가 아니라 "이미 완성된 변경 사항을 어떻게 원자적 커밋 단위로 나눌지"를 다룬다.

`todo-backend`는 독립 Git 저장소이므로 여기서 커밋한다(루트가 아님). 스코프는 `be`. 커밋 메시지는 한국어, 이모지+컨벤셔널 포맷, 헤더 72자 이내, Claude 서명 금지 — 전부 루트 `CLAUDE.md`/`.claude/CLAUDE.md` 규칙.

`git log --oneline`으로 확인한 이 저장소의 기존 관례(M1/M2 커밋들)는 "컴포넌트 단위로 잘게 나누고, 소스와 그 테스트는 같은 커밋에 담는다"는 패턴이다(예: `feat(be): AuthService 회원가입/로그인 비즈니스 로직 구현`, `feat(be): springdoc-openapi 의존성 및 SwaggerConfig 추가`). 이번 커밋 분할도 동일한 패턴을 따른다.

## 커밋 대상에서 제외

- `.metadata/` — Eclipse/STS 워크스페이스 잔여물. CLAUDE.md 명시대로 gitignore 대상이며 읽지도 다루지도 않는다. `git add -A`를 쓰지 않고 매 커밋마다 명시적 경로만 스테이징해서 이 디렉터리가 실수로 섞여 들어가지 않게 한다.

## 커밋 순서 (총 7개, 전부 `git add <경로...>` → `git commit`)

| #   | 이모지+타입   | 커밋 메시지(헤더)                                        | 포함 경로                                                                                                                  |
| --- | ------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 1   | `➕ feat(be)` | jsoup 의존성 및 HtmlSanitizer 구현                       | `pom.xml`, `src/main/java/com/example/common/sanitize/`, `src/test/java/com/example/common/`                               |
| 2   | `✨ feat(be)` | Todo 엔티티 도메인 메서드 및 검색 쿼리 추가              | `src/main/java/com/example/entity/Todo.java`, `src/main/java/com/example/repository/TodoRepository.java`                   |
| 3   | `✨ feat(be)` | PageResponse 공통 응답 및 부분 수정 검증 애노테이션 추가 | `src/main/java/com/example/common/response/PageResponse.java`, `src/main/java/com/example/common/validation/`              |
| 4   | `✨ feat(be)` | 잘못된 요청 바디 파싱 실패를 VALIDATION_FAILED로 처리    | `src/main/java/com/example/common/exception/GlobalExceptionHandler.java`                                                   |
| 5   | `✨ feat(be)` | Todo 요청/응답 DTO 3종 추가                              | `src/main/java/com/example/dto/todo/`                                                                                      |
| 6   | `✨ feat(be)` | TodoService 할 일 CRUD 비즈니스 로직 구현                | `src/main/java/com/example/service/TodoService.java`, `src/test/java/com/example/service/TodoServiceTest.java`             |
| 7   | `✨ feat(be)` | TodoController 할 일 CRUD 6개 엔드포인트 구현            | `src/main/java/com/example/controller/TodoController.java`, `src/test/java/com/example/controller/TodoControllerTest.java` |

순서는 의존 방향(sanitize 인프라 → 엔티티/리포지토리 → 공통 DTO/검증 → 예외 처리 → Todo DTO → 서비스 → 컨트롤러)을 그대로 따른다. `pom.xml`의 jsoup 의존성은 이를 소비하는 `HtmlSanitizer`와 한 커밋으로 묶는다(기존 관례상 "의존성+이를 쓰는 코드"를 함께 커밋한 전례를 따름).

각 커밋은 `git add`로 표에 적힌 경로만 정확히 스테이징한 뒤 커밋한다. 커밋 메시지 헤더는 표의 문구를 `<이모지> <타입>(be): <설명>` 형식으로 조합한다(예: `➕ feat(be): jsoup 의존성 및 HtmlSanitizer 구현`).

## 검증

1. 각 커밋 전 `git status --short`로 스테이징 대상이 계획한 경로와 정확히 일치하는지 확인
2. 마지막 커밋 후 `git status --short`로 `.metadata/`만 미추적 상태로 남아있는지 확인(다른 변경 사항이 누락되지 않았는지)
3. `git log --oneline -7`로 7개 커밋이 의도한 순서·메시지로 기록됐는지 확인
4. `git commit`은 backend의 pre-commit 훅(시크릿 grep + `spotless:check`)을 통과해야 하며, 이미 `mvnw spotless:apply`를 마친 상태라 실패 없이 통과할 것으로 예상

## Critical Files

커밋 대상 파일은 위 표에 전부 나열되어 있으며 전부 이미 작성이 끝난 상태다. 이 계획에서 새로 작성하거나 수정하는 파일은 없다 — git 커밋 명령만 실행한다.
