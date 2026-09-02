# M2-B 구글 로그인 `invalid_client` 오류 진단

## Context

Task 6(통합 검증) 단계에서 사용자가 `http://localhost:8080/oauth2/authorization/google`로
직접 접속해 브라우저 수동 검증을 시도했다. 그 결과 구글이 다음 에러를 반환했다:

> 액세스 차단됨: 승인 오류 — The OAuth client was not found. 401 오류: invalid_client

첨부된 스크린샷(`D:\claude\todo-project\image.png`)의 주소창을 보면 원인이 명확히 드러난다:

```
accounts.google.com/signin/oauth/error?...&client_id=%24%7BGOOGLE_CLIENT_ID%7D&...
```

URL 디코딩하면 `client_id=${GOOGLE_CLIENT_ID}` — Spring이 플레이스홀더를 실제 값으로
치환하지 못하고, **리터럴 문자열 `${GOOGLE_CLIENT_ID}` 그 자체**를 client_id로 구글에
전송했다. 구글은 그런 이름의 클라이언트가 존재하지 않으니 401을 반환한 것이다.

## 근본 원인 (사실 확인됨)

- `todo-backend/src/main/resources/application.properties`(Task 1에서 작성)에는
  `spring.security.oauth2.client.registration.google.client-id=${GOOGLE_CLIENT_ID}`가
  그대로 들어있다 — 이 문법 자체는 올바르다.
- `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`라는 이름의 값이 **`application-local.properties`에도
  OS 환경변수에도 존재하지 않는다.** (이 파일은 gitignore 대상 시크릿 파일이라 harness 정책상
  Claude가 직접 읽거나 grep할 수 없어 존재 여부를 코드로 재확인하지는 못했지만, 구글이 받은
  client_id 값이 미해석 플레이스홀더 그 자체라는 사실 하나만으로 이 결론은 충분히 확정된다.)
- Spring Boot의 `OAuth2ClientPropertiesRegistrationAdapter`는 미해결 `${...}` 플레이스홀더를
  만나도 애플리케이션 기동 시점에는 예외를 던지지 않고 리터럴 텍스트를 그대로 프로퍼티 값으로
  들고 있는다. 그래서 `./mvnw spring-boot:run`은 항상 정상 기동됐고, 실제로 로그인 URL을
  만드는 시점(브라우저가 `/oauth2/authorization/google`을 칠 때)에야 문제가 드러난다.

**정정할 부분**: Task 1 완료 보고 시점에 "`AuthenticationManager` 구성까지 에러 없이 통과했으니
`GOOGLE_CLIENT_ID`가 이미 설정되어 있을 가능성이 높다"고 추정해 전달했는데, 이는 틀린 추정이었다.
그 시점(`SecurityConfig`에 `oauth2Login`이 아직 배선되기 전, Task 5 이전)에는 등록 정보가
실제로 쓰이는 지점까지 요청이 가지 않았기 때문에 플레이스홀더 미해결 문제가 드러나지 않았을 뿐이다.

## 해결 방법 — 코드 변경 없음, 사용자 액션 2가지

이것은 코드 버그가 아니라 **로컬 개발 환경의 시크릿 값 누락**이다. 구현은 이미 올바르다.

1. **구글 클라우드 콘솔에서 OAuth 클라이언트를 아직 안 만들었다면 생성**한다. 리디렉션 URI로
   `http://localhost:8080/login/oauth2/code/google`을 등록한다(`application.properties`
   주석에 이미 안내되어 있음).
2. 발급받은 client-id/client-secret 값을
   `todo-backend/src/main/resources/application-local.properties`에 다음 두 줄로 추가한다:
   ```
   GOOGLE_CLIENT_ID=<구글 콘솔에서 발급받은 클라이언트 ID>
   GOOGLE_CLIENT_SECRET=<구글 콘솔에서 발급받은 클라이언트 보안 비밀번호>
   ```
   (이 파일은 gitignore 대상이라 커밋되지 않는다. `DB_PASSWORD`, `JWT_SECRET`이 이미 같은
   파일에 같은 방식으로 들어있을 것이므로 그 옆에 추가하면 된다.)
3. 값을 추가한 뒤 **백엔드를 재기동**해야 한다(devtools 자동 재시작으로는 프로퍼티 파일 변경이
   반영되지 않을 수 있으므로, 실행 중인 프로세스를 완전히 종료하고 `./mvnw spring-boot:run`을
   다시 실행하는 편이 확실하다).
4. 재기동 후 다시 `http://localhost:8080/oauth2/authorization/google`로 접속해, 이번에는
   실제 구글 로그인 화면(계정 선택 화면)으로 넘어가는지 확인한다.

## 코드 레벨 개선 여부 (선택, 권장하지 않음)

미해결 플레이스홀더가 기동 시점에 조용히 통과되는 것은 Spring Boot의 표준 동작이며, 기동 시점에
이를 검증하는 별도 로직(예: `ApplicationRunner`로 `GOOGLE_CLIENT_ID`가 `${`로 시작하면 경고 로그)을
추가할 수도 있다. 하지만:

- ROADMAP.md M2-B 작업 목록에 이런 항목은 없다.
- 이미 `AuthServiceTest` 등과 마찬가지로 M2-A/M2-B 전체가 이 프로젝트 규모에서는 로컬 1인 개발
  워크플로우이고, 이런 조기 검증 로직은 PRD 범위를 넘어서는 과잉 설계에 가깝다.
- 따라서 **코드 변경은 제안하지 않는다.** 사용자가 원하면 별도로 요청해 달라고 안내한다.

## 검증

1. 사용자가 위 1~3단계를 완료한 뒤, 다시 `http://localhost:8080/oauth2/authorization/google`
   접속 → 구글 계정 선택 화면이 정상적으로 뜨는지 확인 (이번 진단 자체는 여기서 끝나고,
   이후 실제 로그인 성공/계정 연결/취소 시나리오는 Task 6에서 이미 안내한 절차를 그대로 따른다).
2. 문제가 계속되면 `application-local.properties`의 값에 오타나 따옴표, 앞뒤 공백이 없는지
   재확인한다 — `key=value` 형식이며 값에 따옴표를 감싸지 않는다(Java Properties 문법).
