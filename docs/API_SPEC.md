# API_SPEC — Todo List 서비스

| 항목      | 내용                                                         |
| --------- | ------------------------------------------------------------ |
| 문서 버전 | v1.0                                                         |
| 작성일    | 2026-08-27                                                   |
| 기준 문서 | `PRD.md` v1.1 (5.4 API 엔드포인트 개요, 10장 에러 처리 정책) |
| 관련 문서 | `ROADMAP.md` (M2-A · M2-B · M3에서 구현), `DEV_TOOLING.md`   |

> 이 문서는 **프론트엔드와 백엔드 사이의 계약**을 정의한다.
> 엔드포인트 목록의 단일 출처는 `PRD.md` 5.4절이며, 이 문서는 그 요청·응답 스키마를 상세화한다.
> 두 문서가 충돌하면 `PRD.md`가 우선이다.
>
> `ROADMAP.md` M4(프론트엔드 공통 기반)는 이 문서에만 의존한다.
> 따라서 백엔드 구현이 끝나기 전에도 이 문서가 확정되면 프론트엔드 작업을 시작할 수 있다.

---

## 1. 공통 규약

### 1.1 기본 정보

| 항목        | 값                                                        |
| ----------- | --------------------------------------------------------- |
| Base URL    | 로컬 `http://localhost:8080`                              |
| 요청 형식   | `Content-Type: application/json` (OAuth2 리다이렉트 제외) |
| 문자 인코딩 | UTF-8                                                     |
| 날짜 형식   | `yyyy-MM-dd` (마감일), ISO-8601 (타임스탬프)              |

### 1.2 인증 방식 — httpOnly 쿠키

**이 API는 `Authorization: Bearer` 헤더를 사용하지 않는다** (`PRD.md` FR-A06, NFR-S02).

- 로그인·회원가입 성공 시 서버가 `Set-Cookie: access_token=...; HttpOnly; Path=/; Max-Age=86400` 를 내려준다.
- 이후 모든 요청은 브라우저가 쿠키를 자동 전송한다.
- **응답 본문에는 토큰 값이 절대 포함되지 않는다.**
- 프론트엔드는 토큰을 저장·조회·첨부하지 않으며, `fetch` 호출에 `credentials: "include"` 만 설정한다.
- 로그인 여부 판정은 `GET /api/auth/me` 응답으로 한다.

```ts
// 프론트엔드 API 클라이언트 — 토큰을 다루는 코드가 없어야 한다
const res = await fetch(`${BASE_URL}${path}`, {
  method,
  headers: { "Content-Type": "application/json" },
  credentials: "include", // 쿠키 자동 전송 — 이것이 인증의 전부다
  body: body ? JSON.stringify(body) : undefined,
});
```

### 1.3 공통 응답 래퍼 — `ApiResponse<T>`

모든 응답은 아래 형태로 감싼다 (`PRD.md` NFR-M02).

```json
{
  "success": true,
  "data": {},
  "error": null
}
```

실패 시:

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "EMAIL_DUPLICATED",
    "message": "이미 사용 중인 이메일입니다",
    "fieldErrors": [{ "field": "email", "message": "이미 사용 중인 이메일입니다" }]
  }
}
```

- `fieldErrors`는 입력값 검증 실패(400)일 때만 채워지고, 그 외에는 `null`이다.
- `message`는 사용자에게 그대로 보여줄 수 있는 한국어 문장이다.
- 스택트레이스·내부 예외 메시지·SQL은 어떤 경우에도 포함하지 않는다 (NFR-S07).

### 1.4 목록 응답 래퍼 — `PageResponse<T>`

Spring의 `Page` 객체를 그대로 직렬화하지 않는다. 아래 DTO로 변환해 반환한다.

```json
{
  "success": true,
  "data": {
    "content": [],
    "page": 0,
    "size": 10,
    "totalElements": 42,
    "totalPages": 5,
    "first": true,
    "last": false
  },
  "error": null
}
```

- `page`는 **0부터 시작**한다. 화면의 페이지 번호(1부터)와 변환이 필요하다.
- `totalPages`는 페이지네이션 컴포넌트의 번호 축약 표시(`PRD.md` FR-U06)에 사용한다.

### 1.5 에러 코드

`PRD.md` 10장 에러 처리 정책과 1:1 대응한다.

| 코드                | HTTP | 메시지                                                   | 발생 상황                          |
| ------------------- | ---- | -------------------------------------------------------- | ---------------------------------- |
| `VALIDATION_FAILED` | 400  | 필드별 메시지는 `fieldErrors` 참조                       | Bean Validation 실패               |
| `EMAIL_DUPLICATED`  | 400  | 이미 사용 중인 이메일입니다                              | 활성 계정에 같은 이메일 존재       |
| `LOGIN_FAILED`      | 401  | 이메일 또는 비밀번호가 올바르지 않습니다                 | 계정 없음 **또는** 비밀번호 불일치 |
| `UNAUTHORIZED`      | 401  | 로그인이 필요합니다                                      | 쿠키 없음·만료·위조                |
| `TODO_NOT_FOUND`    | 404  | 요청하신 할 일을 찾을 수 없습니다                        | 없는 ID **또는** 타인 소유         |
| `INTERNAL_ERROR`    | 500  | 일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요 | 그 외 모든 예외                    |

> **`LOGIN_FAILED`와 `TODO_NOT_FOUND`는 의도적으로 원인을 구분하지 않는다.**
> 계정 존재 여부나 리소스 존재 여부가 드러나면 열거 공격이 가능하기 때문이다
> (`PRD.md` FR-T13, NFR-S06).

---

## 2. 인증 API

### 2.1 `POST /api/auth/signup` — 회원가입

**인증 불필요** · 대응 FR: FR-A01~A05, A12

요청

```json
{
  "email": "user@example.com",
  "password": "abc123",
  "nickname": "홍길동"
}
```

| 필드       | 제약                                 | 실패 시 메시지                   |
| ---------- | ------------------------------------ | -------------------------------- |
| `email`    | 필수, 이메일 형식                    | 올바른 이메일 형식이 아닙니다    |
| `password` | 필수, **6자 이상** (그 외 규칙 없음) | 비밀번호는 6자 이상이어야 합니다 |
| `nickname` | 필수, 1~50자                         | 닉네임을 입력해 주세요           |

응답 `201 Created` + `Set-Cookie: access_token=...; HttpOnly`

```json
{
  "success": true,
  "data": { "id": 1, "email": "user@example.com", "nickname": "홍길동", "provider": "LOCAL" },
  "error": null
}
```

- 가입 즉시 로그인 상태가 되므로 별도 로그인 호출이 필요 없다.
- 유일성 판정에서 `deleted_at IS NOT NULL` 계정은 제외한다 (FR-A12).

### 2.2 `POST /api/auth/login` — 로그인

**인증 불필요** · 대응 FR: FR-A02, A03, A06

요청

```json
{ "email": "user@example.com", "password": "abc123" }
```

응답 `200 OK` + `Set-Cookie: access_token=...; HttpOnly; Max-Age=86400`

```json
{
  "success": true,
  "data": { "id": 1, "email": "user@example.com", "nickname": "홍길동", "provider": "LOCAL" },
  "error": null
}
```

- **응답 본문에 토큰 값을 넣지 않는다.** JWT는 오직 `Set-Cookie`로만 전달된다.
- 실패 시 `401` + `LOGIN_FAILED`. 계정 없음과 비밀번호 불일치를 구분하지 않는다.
- 소셜 전용 계정(`password IS NULL`)으로 로그인 시도해도 `LOGIN_FAILED`를 반환한다.

### 2.3 `POST /api/auth/logout` — 로그아웃

**인증 필요** · 대응 FR: FR-A07

요청 본문 없음. 응답 `200 OK` + `Set-Cookie: access_token=; Max-Age=0`

```json
{ "success": true, "data": null, "error": null }
```

### 2.4 `GET /api/auth/me` — 내 정보 조회

**인증 필요** · 대응 FR: FR-A11

**프론트엔드의 인증 상태 판정은 이 엔드포인트로만 한다.** 쿠키를 읽어 판정하지 않는다.

응답 `200 OK`

```json
{
  "success": true,
  "data": { "id": 1, "email": "user@example.com", "nickname": "홍길동", "provider": "GOOGLE" },
  "error": null
}
```

- 미인증 시 `401` + `UNAUTHORIZED` → 프론트는 `/login`으로 유도한다 (FR-A10).

### 2.5 `GET /oauth2/authorization/google` — 구글 로그인 시작

**인증 불필요** · 대응 FR: FR-A08, A09

- JSON API가 아니다. 브라우저를 이 주소로 **이동**시킨다(`fetch` 금지).
- Spring Security OAuth2 Client가 구글 동의 화면으로 리다이렉트한다.
- 요청 scope: `email`, `profile`

처리 흐름

```
[프론트] window.location.href = "/oauth2/authorization/google"
   ↓
[구글] 사용자 동의
   ↓
[백엔드] /login/oauth2/code/google  (Spring Security 기본 경로)
   ↓ CustomOAuth2UserService
   ├─ 같은 이메일의 활성 계정 있음 → 그 계정에 연결 (중복 생성 안 함, FR-A09)
   └─ 없음                          → provider=GOOGLE, password=NULL 로 신규 생성
   ↓ OAuth2SuccessHandler — httpOnly 쿠키 발급
[프론트] /oauth2/callback 으로 리다이렉트 → /todos
```

- 실패·동의 취소 시 `OAuth2FailureHandler`가 `/login?error=oauth` 로 보낸다.
- **`/oauth2/callback` 화면은 토큰을 받지 않는다.** 쿠키는 이미 심어진 상태이며, 이 화면은 목적지로 넘기는 역할만 한다.

---

## 3. Todo API

**모든 Todo 엔드포인트는 인증이 필요하며, 소유권 스코프 조회를 거친다.**
조회 조건은 항상 `id = ? AND user_id = ? AND deleted_at IS NULL` 이며,
결과가 없으면 원인을 구분하지 않고 `404 TODO_NOT_FOUND`를 반환한다 (FR-T13, NFR-S06).

### 3.1 `GET /api/todos` — 목록 조회

대응 FR: FR-T05~T08

쿼리 파라미터

| 파라미터    | 타입    | 기본값           | 설명                                                   |
| ----------- | ------- | ---------------- | ------------------------------------------------------ |
| `page`      | int     | `0`              | 0부터 시작                                             |
| `size`      | int     | `10`             | 페이지 크기                                            |
| `completed` | boolean | 없음(=전체)      | `true` 완료만 / `false` 미완료만 (FR-T07)              |
| `keyword`   | string  | 없음             | 제목·설명 부분 일치 검색 (FR-T08)                      |
| `sort`      | string  | `createdAt,desc` | **확장 대비용. 프론트엔드는 사용하지 않는다** (FR-T06) |

예: `GET /api/todos?page=0&size=10&completed=false&keyword=회의`

응답 `200 OK`

```json
{
  "success": true,
  "data": {
    "content": [
      {
        "id": 12,
        "title": "주간 회의 자료 준비",
        "description": "<p><strong>3분기</strong> 실적 정리</p>",
        "dueDate": "2026-09-01",
        "priority": "HIGH",
        "completed": false,
        "createdAt": "2026-08-27T10:12:33",
        "updatedAt": "2026-08-27T10:12:33"
      }
    ],
    "page": 0,
    "size": 10,
    "totalElements": 42,
    "totalPages": 5,
    "first": true,
    "last": false
  },
  "error": null
}
```

- 정렬은 **최신 생성순 고정**이다 (FR-T06).
- 페이지네이션은 DB 레벨에서 수행한다. 전체를 메모리에 올리지 않는다 (NFR-P01).
- `user_id` 조건이 항상 붙으므로 타인의 할 일은 어떤 파라미터 조합으로도 나오지 않는다.

### 3.2 `POST /api/todos` — 생성

대응 FR: FR-T01~T04

요청

```json
{
  "title": "주간 회의 자료 준비",
  "description": "<p><strong>3분기</strong> 실적 정리</p>",
  "dueDate": "2026-09-01",
  "priority": "HIGH"
}
```

| 필드          | 제약                                           |
| ------------- | ---------------------------------------------- |
| `title`       | **필수**, 1~200자                              |
| `description` | 선택. HTML 문자열, **서버에서 sanitize**       |
| `dueDate`     | 선택. `yyyy-MM-dd`, **과거 날짜 허용**         |
| `priority`    | 선택. `HIGH` / `MEDIUM` / `LOW`, 기본 `MEDIUM` |

응답 `201 Created` — 생성된 Todo 객체 (3.1의 `content` 항목과 동일한 형태)

**description sanitize 규칙** (NFR-S05)

- 허용 태그: `p` `br` `strong` `em` `u` `s` `h1`~`h3` `ul` `ol` `li` `blockquote` `code`
- 제거 대상: `script` `iframe` `style`, 모든 `on*` 이벤트 핸들러 속성, `javascript:` URL
- 서버에서 저장 **전**에 처리한다. 프론트 검증에 의존하지 않는다 (NFR-S04).

### 3.3 `GET /api/todos/{id}` — 상세 조회

대응 FR: FR-T05, T13 · 화면: `/todos/[id]`

응답 `200 OK` — Todo 객체 하나.
없거나 타인 소유면 `404 TODO_NOT_FOUND`.

### 3.4 `PATCH /api/todos/{id}` — 수정

대응 FR: FR-T09, T13

요청 — **부분 수정**. 보낸 필드만 반영한다.

```json
{ "title": "수정된 제목", "priority": "LOW" }
```

- `completed`는 이 엔드포인트로 바꾸지 않는다. 3.5의 토글 전용 엔드포인트를 쓴다.
- `description`은 여기서도 sanitize를 거친다.
- 응답 `200 OK` — 수정된 Todo 객체.

### 3.5 `PATCH /api/todos/{id}/toggle` — 완료 토글

대응 FR: FR-T10, T13

요청 본문 없음. 현재 `completed` 값을 반전시킨다.

응답 `200 OK` — 토글된 Todo 객체.

> **낙관적 업데이트 대상이다** (FR-T12).
> 프론트엔드는 응답을 기다리지 않고 화면을 먼저 바꾸고, 실패하면 이전 상태로 되돌린다.

### 3.6 `DELETE /api/todos/{id}` — 삭제 (Soft Delete)

대응 FR: FR-T11, T13

응답 `200 OK`

```json
{ "success": true, "data": null, "error": null }
```

- **물리 삭제하지 않는다.** `deleted_at`에 현재 시각을 기록한다.
- 삭제 후 목록·검색·상세 조회 어디에서도 조회되지 않는다.
- 낙관적 업데이트 대상이다 (FR-T12).

---

## 4. 기타

### 4.1 `GET /api/health` — 헬스체크

**인증 불필요.** M0 스캐폴딩 검증용.

```json
{ "success": true, "data": { "status": "UP" }, "error": null }
```

### 4.2 CORS

- 허용 출처: 로컬 `http://localhost:3000` (와일드카드 금지, NFR-S08)
- `allowCredentials: true` — 쿠키 인증에 필수
- 허용 메서드: `GET` `POST` `PATCH` `DELETE` `OPTIONS`

### 4.3 Swagger

- 로컬 문서: `http://localhost:8080/swagger-ui.html`
- 모든 엔드포인트가 문서에 나타나야 한다 (NFR-M03).

---

## 5. FR ↔ 엔드포인트 대응표

`PRD.md` 5장의 기능 요구사항 중 백엔드가 필요한 항목이 전부 대응 엔드포인트를 갖는지 확인하는 표다.

| FR ID            | 엔드포인트                                           |
| ---------------- | ---------------------------------------------------- |
| FR-A01~A05, A12  | `POST /api/auth/signup`                              |
| FR-A02, A03, A06 | `POST /api/auth/login`                               |
| FR-A07           | `POST /api/auth/logout`                              |
| FR-A08, A09      | `GET /oauth2/authorization/google`                   |
| FR-A10           | 전 인증 엔드포인트의 `401 UNAUTHORIZED` 응답         |
| FR-A11           | `GET /api/auth/me`                                   |
| FR-T01~T04       | `POST /api/todos`                                    |
| FR-T05           | `GET /api/todos`, `GET /api/todos/{id}`              |
| FR-T06~T08       | `GET /api/todos` (쿼리 파라미터)                     |
| FR-T09           | `PATCH /api/todos/{id}`                              |
| FR-T10           | `PATCH /api/todos/{id}/toggle`                       |
| FR-T11           | `DELETE /api/todos/{id}`                             |
| FR-T13           | `/api/todos/{id}` 전 계열의 소유권 스코프 조회 + 404 |
| FR-T12           | 백엔드 계약 없음 — 프론트엔드 낙관적 업데이트로 구현 |
| FR-U01~U08       | 백엔드 계약 없음 — 프론트엔드 전용                   |
