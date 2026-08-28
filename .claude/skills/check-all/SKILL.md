---
name: check-all
description: 프론트엔드·백엔드·루트 문서 세 영역을 모두 검증한다. 루트 `npm run check`는 프론트엔드만 커버하므로, 커밋·푸시 전이나 "전체 검사/검증해줘" 요청 시 이 스킬을 사용한다.
---

# 전체 검증

이 저장소는 독립된 Git 저장소 3개라 검증 명령이 세 갈래로 나뉘어 있고, 셋을 한 번에 도는 npm 스크립트가 없다. 아래 순서대로 실행한다.

## 실행 순서

빠르고 실패 가능성이 높은 것부터 돈다. **하나가 실패해도 멈추지 말고 세 단계를 모두 실행한 뒤** 결과를 한 번에 보고한다 — 사용자가 전체 상태를 한눈에 보게 하는 것이 목적이다.

### 1. 프론트엔드

```bash
npm --prefix todo-frontend run check
```

`typecheck` → `lint:strict`(`--max-warnings=0`) → `format:check` 순으로 돈다. CI 및 pre-push와 동일한 기준이다.

### 2. 루트 문서·설정

```bash
npx prettier --check .
```

루트 `prettier.config.mjs`가 적용되며 `.prettierignore`가 `todo-frontend`를 통째로 제외하므로 1단계와 겹치지 않는다.

### 3. 백엔드

```bash
cd todo-backend && ./mvnw verify
```

Spotless가 Maven `validate` 페이즈에 묶여 있어 **포맷 위반도 여기서 실패로 잡힌다.** 실패 로그가 `spotless` 관련이면 테스트 실패가 아니라 포맷 문제다.

Java 파일을 전혀 건드리지 않은 변경이라면 이 단계는 건너뛰어도 된다 (JVM 기동이 느리다). 다만 건너뛰었다면 보고에 명시한다.

## 실패 시 수정

사용자가 수정까지 요청한 경우에만 적용한다.

| 실패 유형             | 수정 명령                                  |
| --------------------- | ------------------------------------------ |
| 프론트엔드 포맷       | `npm --prefix todo-frontend run format`    |
| 프론트엔드 lint       | `npm --prefix todo-frontend run lint:fix`  |
| 루트 문서 포맷        | `npx prettier --write .`                   |
| Java 포맷             | `cd todo-backend && ./mvnw spotless:apply` |
| 타입 오류·테스트 실패 | 자동 수정 없음. 원인을 읽고 코드를 고친다  |

## 보고 형식

세 영역을 표로 정리하고, 실패한 항목은 오류 원문의 핵심 줄을 인용한다. 통과한 항목을 장황하게 설명하지 않는다.

| 영역       | 결과                |
| ---------- | ------------------- |
| 프론트엔드 | ✅ / ❌ (실패 요약) |
| 루트 문서  | ✅ / ❌             |
| 백엔드     | ✅ / ❌ / ⏭️ 건너뜀 |

## 주의

- 루트 `npm run be:verify`는 `mvnw.cmd`를 하드코딩해 **Windows 전용**이다. 이 스킬에서는 쓰지 말고 `./mvnw`를 직접 호출한다.
- 백엔드는 Java 21이 필요하다. 이 머신은 `JAVA_HOME`이 JDK 21이지만 PATH의 `java`가 17일 수 있다. `./mvnw`는 `JAVA_HOME`을 따르므로 정상이며, 맨손으로 `javac`를 부르지 않는다.
