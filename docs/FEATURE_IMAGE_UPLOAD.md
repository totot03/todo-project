# 기능 추가: Tiptap 이미지 첨부 (로컬 → S3)

문서 버전: v2 (2026-09-04 개정)
기준 문서: 루트 `CLAUDE.md` / `docs/PRD.md` / `docs/API_SPEC.md` / `docs/ROADMAP.md`
관련 미결정 항목: `PRD.md` 13장 OQ-4 (상세 설명 이미지 첨부) → **본 문서로 확정**

> **v1 → v2 개정 사유.** v1은 `.playwright-mcp/CLAUDE.md`(1~13장 번호가 있고 "모노레포 구조"라고
> 서술하는 구버전, git 미추적)를 기준으로 작성되어 현재 코드베이스와 어긋난 전제가 다수 있었다.
> **기준은 루트 `CLAUDE.md`이며 `.playwright-mcp/CLAUDE.md`는 참조하지 않는다.**
> 주요 교정: yml→properties 전환 단계 삭제(이미 properties다) · `.env` 지시 삭제(읽는 주체가 없다) ·
> 이미지 URL 경로 설계 추가(상대경로만으로는 404) · sanitize 구현 방식 구체화 · 에러 코드 3종 확정 ·
> 갱신 대상에 `API_SPEC.md` 추가.

---

## 0. 시작 전 필독

### 0.1 자격 증명

**AWS 액세스 키를 이 파일이나 어떤 소스 파일에도 적지 않는다.**

- 이미 키를 채팅·문서·커밋 어딘가에 붙여넣은 적이 있다면 **IAM 콘솔에서 즉시 폐기하고 새로 발급**한다
- 해당 IAM 사용자에게는 이 버킷에 대한 `PutObject` / `GetObject` / `DeleteObject`만 부여한다
  (`AmazonS3FullAccess` 금지)
- 값은 OS 환경변수 또는 `application-local.properties`(gitignore 대상)에만 둔다 — 6장 참고

**단, 5.0~5.3 단계에서는 AWS 키가 없어도 개발과 테스트가 전부 가능하다.** S3는 5.4로 분리했다.

### 0.2 기준 문서

| 확인할 내용                             | 어디를 보나                               |
| --------------------------------------- | ----------------------------------------- |
| 불변 규칙(응답 봉투·Soft Delete·소유권) | 루트 `CLAUDE.md` "불변 규칙" 절           |
| 기존 엔드포인트 계약·에러 코드          | `docs/API_SPEC.md` 1장, `docs/PRD.md` 5.4 |
| 요구사항 번호 체계·설치 상태            | `docs/PRD.md` 1.3 / 5.2 / 9.1 / 13장      |
| 마일스톤 범위                           | `docs/ROADMAP.md` 3장 / 7장 / 8장 / 9장   |

---

## 1. 설계 결정

### 1.1 핵심: 저장소를 교체 가능하게 만든다

로컬에서는 디스크에, 배포 후에는 S3에 저장한다. **애플리케이션 코드와 API 계약은 동일하게 유지**하고,
설정값 하나(`file.storage.type`)로 전환한다.

```
FileStorageService (인터페이스)
├── LocalFileStorageService   ← file.storage.type=local  (기본, 이번 범위)
└── S3FileStorageService      ← file.storage.type=s3     (5.4, v1.1 배포 시)
```

- 로컬 저장 위치: **`todo-project/upload/`** (저장소 루트, `todo-backend`와 같은 레벨)
- 이 폴더는 **루트 `.gitignore`에 추가**한다
- S3로 전환해도 프론트엔드 코드와 저장된 HTML은 한 글자도 바뀌지 않는다

### 1.2 그 외 결정

| 항목             | 결정                                                                                 | 이유                                               |
| ---------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------- |
| 업로드 경로      | **백엔드 경유** (프론트 → Spring → 저장소)                                           | 파일 검증·소유권 기록을 서버에서 한 번에 처리      |
| 버킷 공개 여부   | S3 전환 시 **비공개(Private) 유지**                                                  | URL이 유출돼도 접근 불가                           |
| 이미지 제공 방식 | HTML에 `/api/files/{uuid}` 저장 → 로컬은 파일 스트리밍, S3는 presigned GET URL로 302 | 저장소가 바뀌어도 본문이 안 깨짐. 소유권 검증 가능 |
| 브라우저 경로    | Next.js `rewrites`로 `/api/files/*`를 백엔드에 프록시 (4장)                          | 저장 HTML과 표시 HTML을 동일하게 유지              |
| 업로드 시점      | Todo 저장 **전에** 즉시 업로드 (`todo_id`는 nullable)                                | 에디터에 바로 이미지가 보여야 함                   |
| 고아 파일        | `todo_id`가 null이고 **`updated_at`이 24시간 이전**인 레코드를 정리 대상으로 본다    | 작성 중 이탈로 생기는 미사용 파일                  |
| 정리 방식        | **레코드는 `deleted_at` 기록(soft delete), 실제 blob만 물리 삭제**                   | Soft Delete 불변 규칙에 예외를 만들지 않는다       |
| Todo 삭제 시     | 첨부 레코드도 blob도 **건드리지 않음**                                               | Todo가 soft delete라 복구 시 본문이 살아 있어야 함 |

### 1.3 첨부 ↔ Todo 연결 모델의 한계 (중요)

`attachments.todo_id`는 단일 FK다. 다음 두 가지가 실제로 발생하므로 정리 로직에서 방어한다.

1. **본문 복사·붙여넣기.** 두 Todo가 같은 uuid를 참조해도 `todo_id`는 한쪽만 가리킨다.
   나중 Todo가 이미지를 빼면 `todo_id`가 null이 되고, 여전히 그 이미지를 쓰는 첫 Todo의 본문이 깨진다.
2. **오래된 이미지를 오늘 본문에서 뺀 경우.** 정리 기준이 `created_at`이면 다음 실행에서 즉시 삭제된다.

→ 정리 기준을 **`updated_at`**으로 두어 링크 해제 후에도 24시간 유예를 주고,
**삭제 직전 "활성 Todo 본문 어디에도 해당 uuid가 없는지" 재확인하는 가드 쿼리**를 통과한 것만 지운다.
다대다 조인 테이블은 이 규모에 과하다고 판단해 도입하지 않는다.

---

## 2. DB 스키마 (신규 테이블)

`attachments`

| 컬럼                    | 타입                 | 비고                                                                                    |
| ----------------------- | -------------------- | --------------------------------------------------------------------------------------- |
| id                      | BIGSERIAL PK         |                                                                                         |
| uuid                    | UUID                 | 외부 노출용 식별자. `/api/files/{uuid}`. UNIQUE                                         |
| user_id                 | BIGINT FK → users.id | 소유권 검증 기준. NOT NULL                                                              |
| todo_id                 | BIGINT FK → todos.id | **NULL 허용** (작성 중 업로드)                                                          |
| storage_type            | VARCHAR(10)          | `LOCAL` / `S3`. `@Enumerated(EnumType.STRING)`                                          |
| storage_key             | VARCHAR(500)         | `todos/{userId}/{yyyy}/{MM}/{uuid}.{ext}` — 로컬은 base-dir 기준 상대경로, S3는 객체 키 |
| original_filename       | VARCHAR(255)         | 표시용으로만 쓴다. **경로 생성에 사용하지 않는다**                                      |
| content_type            | VARCHAR(100)         | 매직 바이트로 판정한 값 (5.1 참고)                                                      |
| file_size               | BIGINT               | 바이트                                                                                  |
| created_at / updated_at | TIMESTAMP            | `BaseTimeEntity` 상속                                                                   |
| deleted_at              | TIMESTAMP            | Soft Delete. `@SQLRestriction("deleted_at IS NULL")`                                    |

인덱스: `uuid` UNIQUE, `(user_id, deleted_at)`, `(todo_id)`

> **`storage_type`이 중요하다.** 로컬에서 올린 파일과 S3에 올린 파일이 섞여도
> 각 레코드가 자기 위치를 알고 있어야 조회가 깨지지 않는다.
> `todos` 테이블은 변경하지 않는다.

> **`schema.sql`은 건드리지 않는다.** `resources/schema.sql`은 Hibernate로 표현할 수 없는
> **부분 인덱스**(`WHERE deleted_at IS NULL`)를 위해 존재한다. `attachments`의 인덱스는 부분 인덱스가
> 아니므로 `@Table(indexes = {...})`와 `@Column(unique = true)`만으로 `ddl-auto=update`가 만들어 준다.

---

## 3. API 계약

`docs/API_SPEC.md` 1장 공통 규약을 따르되, 아래 **두 가지 예외**를 API_SPEC에 명시한 뒤 구현한다.

### 3.1 규약 예외

1. **요청 형식 예외** — `POST /api/files/images`는 `Content-Type: application/json`이 아니라
   `multipart/form-data`다. API_SPEC 1.1의 "모든 요청은 JSON" 규약에 예외 조항을 추가한다.
2. **응답 봉투 예외** — `GET /api/files/{uuid}`의 **성공 응답**은 `ApiResponse<T>`가 아니라
   바이너리 스트림 또는 302 리다이렉트다. API_SPEC 1.3에 예외 조항을 추가한다.
   **에러 응답(401/404)은 기존대로 봉투를 유지한다.**

이 엔드포인트만 컨트롤러 반환형이 프로젝트 관례(`ApiResponse<T>` 직접 반환)를 벗어나
`ResponseEntity<Resource>`가 된다. 그 근거를 컨트롤러 Javadoc에 남긴다.

### 3.2 `POST /api/files/images`

- 인증 필수. `multipart/form-data`, 파트 이름 `file`
- 성공 `201 Created`

```json
{
  "success": true,
  "data": {
    "uuid": "3f2a…",
    "url": "/api/files/3f2a…",
    "filename": "스크린샷.png",
    "size": 154823
  },
  "error": null
}
```

### 3.3 `GET /api/files/{uuid}`

- 인증 필수. `SecurityConfig`의 `permitAll` 목록에 **넣지 않는다**
- 소유권 불일치·부재 모두 `FILE_NOT_FOUND`(404) — `TODO_NOT_FOUND`와 같은 이유로 원인을 구분하지 않는다
- `storage_type = LOCAL` → 파일 스트리밍, `S3` → presigned GET URL로 302

응답 헤더:

```
Content-Type: <DB의 content_type>          ← 요청값을 반사하지 않는다
Content-Disposition: inline
Cache-Control: private, max-age=3600
X-Content-Type-Options: nosniff
Content-Security-Policy: default-src 'none'
```

### 3.4 에러 코드 (3종 추가)

`ErrorCode`는 "6종 고정, 임의로 추가하지 않는다"가 코드·`CLAUDE.md`·`API_SPEC.md` 3곳에 못 박혀 있다.
이번 기능으로 **9종으로 확장**하며, 세 문서를 함께 갱신한다.

| 코드                | 상태 | 메시지                                |
| ------------------- | ---- | ------------------------------------- |
| `FILE_TOO_LARGE`    | 400  | 파일 크기는 5MB를 초과할 수 없습니다. |
| `INVALID_FILE_TYPE` | 400  | 지원하지 않는 이미지 형식입니다.      |
| `FILE_NOT_FOUND`    | 404  | 파일을 찾을 수 없습니다.              |

메시지가 `ErrorCode` enum에 묶여 있어 개별 문장 지정이 불가능하기 때문에, 용량/타입을
`VALIDATION_FAILED`로 뭉뚱그리면 사용자가 원인을 알 수 없다. 그래서 코드를 나눈다.

---

## 4. 이미지 URL 경로와 rewrite

**v1의 최대 결함이 여기였다.** 본문에는 `/api/files/{uuid}` 상대경로가 저장되는데,
프론트엔드는 `localhost:3000`, API는 `localhost:8080`으로 오리진이 다르다.
`next.config.ts`에는 rewrites가 없어 `<img src="/api/files/…">`는 Next 서버로 가서 **404**가 된다.

해결: `/api/files/*`만 백엔드로 프록시한다.

```ts
// todo-frontend/next.config.ts
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

const nextConfig: NextConfig = {
  typedRoutes: true,
  // 본문에 저장되는 이미지 경로는 상대경로 하나뿐이다. 브라우저가 3000으로 보내는 요청을
  // 백엔드로 넘겨 "저장 HTML == 표시 HTML"을 유지한다.
  async rewrites() {
    return [{ source: "/api/files/:path*", destination: `${API_BASE}/api/files/:path*` }];
  },
};
```

- **`/api/*` 전체를 프록시하지 않는다.** `lib/api/client.ts`가 이미 절대 URL로 호출하고 있어 경로가 이중화된다
- 업로드(`POST /api/files/images`)는 기존대로 `apiFetch`가 절대 URL로 호출한다. **표시 경로만** 프록시된다
- 이미지 요청이 same-origin이 되므로 쿠키·CORS를 따로 신경 쓸 필요가 없다
- S3 전환 후 백엔드가 302를 반환해도 rewrite는 응답을 그대로 전달하고, 브라우저가 S3로 따라간다
- `proxy.ts`의 matcher는 `/todos/:path*`뿐이라 충돌하지 않는다
- **배포 시에도 프론트 호스트가 같은 rewrite를 제공해야 한다** (v1.1 배포 체크리스트에 포함)

---

## 5. 실행 단계

### 5.0 사전 확인 및 프로퍼티 추가

> v1의 "Step 0: application.yml → application.properties 전환"은 **삭제했다.**
> `todo-backend/src/main/resources/`에는 이미 `application.properties`,
> `application-local.properties`, `application-test.properties`, `schema.sql`만 있고 yml은 없다.

`src/main/resources/application.properties`에 추가:

```properties
# --- 파일 업로드 (M7) ---
# multipart 한도는 앱 한도(5MB)보다 크게 잡는다 — 같게 두면 컨테이너가 먼저 요청을 끊어
# 우리 검증 로직에 도달하지 못하고 에러 원인을 구분할 수 없게 된다
spring.servlet.multipart.max-file-size=6MB
spring.servlet.multipart.max-request-size=8MB

# 저장소: local(기본) 또는 s3
file.storage.type=${FILE_STORAGE_TYPE:local}
file.storage.max-size=5242880
file.storage.local.base-dir=${FILE_LOCAL_BASE_DIR:../upload}
```

`src/main/resources/application-test.properties`에 추가:

```properties
file.storage.type=local
file.storage.local.base-dir=./target/test-upload
```

> **테스트 설정 파일은 `src/main/resources/`에 있다.** `src/test/resources/` 디렉터리는
> 이 프로젝트에 존재하지 않으며, 테스트는 `@ActiveProfiles("test")`로 프로필을 활성화한다.

---

### 5.1 백엔드: 스키마 + 로컬 저장소

```
루트 CLAUDE.md와 docs/FEATURE_IMAGE_UPLOAD.md를 먼저 읽어줘.

5.1: 이미지 첨부 백엔드를 구현한다. 이번 단계는 로컬 디스크 저장만 구현하고
S3는 5.4에서 붙인다. 지금 AWS 의존성이나 키는 필요 없다.

[사전 확인]
- entity/BaseTimeEntity, User, Todo의 기존 컨벤션을 먼저 확인해
  (@SQLRestriction Soft Delete, Lombok @Builder, DTO는 from(...) 정적 팩토리)

[엔티티]
- Attachment 엔티티 + AttachmentRepository (스키마는 이 문서 2장 그대로)
- BaseTimeEntity 상속, @SQLRestriction("deleted_at IS NULL")
- User, Todo와 @ManyToOne(fetch = LAZY)
- StorageType enum (LOCAL, S3), @Enumerated(EnumType.STRING)
- 인덱스는 @Table(indexes = {...})로. schema.sql은 건드리지 마 (부분 인덱스가 아니다)

[에러 코드]
- ErrorCode에 FILE_TOO_LARGE(400), INVALID_FILE_TYPE(400), FILE_NOT_FOUND(404) 추가
- enum 주석의 "6종" 표기를 갱신하고, FILE_NOT_FOUND가 부재와 타인 소유를 구분하지 않는
  이유(TODO_NOT_FOUND와 동일)를 주석으로 남겨
- GlobalExceptionHandler에 MaxUploadSizeExceededException 핸들러를 추가해
  FILE_TOO_LARGE로 변환한다 (컨테이너가 먼저 끊는 경우도 같은 봉투로 응답해야 한다)

[저장소 추상화]
- service/storage/FileStorageService 인터페이스:
  - StoredFile store(MultipartFile file, String storageKey)
  - Resource load(String storageKey)            // 로컬 스트리밍용
  - String getRedirectUrl(String storageKey)    // S3 presigned용, 로컬은 null 반환
  - void delete(String storageKey)
  - StorageType getType()
- LocalFileStorageService 구현:
  - @ConditionalOnProperty(name="file.storage.type", havingValue="local", matchIfMissing=true)
  - 기준 경로는 file.storage.local.base-dir 프로퍼티 (기본 ../upload)
  - 애플리케이션 시작 시 폴더가 없으면 생성하고, 해석된 절대경로를 로그로 남긴다
  - 저장 경로: {base-dir}/todos/{userId}/{yyyy}/{MM}/{uuid}.{ext}
  - 보안: 파일명은 반드시 새 UUID로 생성한다. 원본 파일명을 경로에 쓰지 않는다.
    store/load/delete 모두 최종 경로를 normalize한 뒤 base-dir 하위인지 검증하고,
    벗어나면 예외 (DB의 storage_key가 오염된 경우까지 막는다)

[업로드 서비스]
- AttachmentService.upload(MultipartFile, userId):
  검증 → storageKey 생성 → FileStorageService.store → Attachment 저장 → uuid 반환

[파일 검증 — 확장자도 Content-Type 헤더도 믿지 않는다]
- MultipartFile.getContentType()은 클라이언트가 보낸 값이라 신뢰할 수 없다.
  파일 선두 매직 바이트로 판정해:
    JPEG  FF D8 FF
    PNG   89 50 4E 47 0D 0A 1A 0A
    GIF   47 49 46 38  ("GIF8")
    WebP  52 49 46 46 ... 57 45 42 50 (offset 8)
- ImageIO.read()로 판정하지 마. JDK에 WebP 리더가 없어 정상 webp를 거부한다
- SVG는 허용하지 않는다 (스크립트를 품을 수 있다)
- 판정된 형식으로 확장자와 content_type을 서버가 결정한다. 원본 확장자를 쓰지 마
- 크기는 file.storage.max-size 기준, 초과 시 FILE_TOO_LARGE

[API]
- POST /api/files/images (multipart, 인증 필수, 201)
  - 응답: { uuid, url: "/api/files/{uuid}", filename, size }
- GET /api/files/{uuid} (인증 필수)
  - 소유권 검증. 없거나 남의 파일이면 FILE_NOT_FOUND(404)
  - storage_type이 LOCAL이면 파일 스트리밍, S3면 getRedirectUrl 결과로 302
    (5.4 전까지는 분기만 만들어두고 S3 쪽은 미구현으로 둬도 된다)
  - 응답 헤더는 이 문서 3.3 그대로. Content-Type은 DB 값을 쓰고 요청값을 반사하지 마
  - 이 엔드포인트만 ResponseEntity<Resource>를 반환한다(응답 봉투 예외). 근거를 Javadoc에 남겨
- SecurityConfig의 permitAll 목록에 /api/files/**를 추가하지 마 (인증 필수)

[Todo 연결]
- Todo 생성/수정 시 sanitize를 마친 description HTML에서 /api/files/{uuid}를 파싱해
  해당 Attachment의 todo_id를 채운다
- 링크 갱신 쿼리에는 반드시 user_id = :userId 조건을 넣어라.
  없으면 사용자 A가 본문에 남의 uuid를 적어 B의 첨부 레코드를 오염시킬 수 있다
- 수정으로 본문에서 빠진 이미지는 todo_id를 null로 되돌린다 (물리 삭제 안 함)

[sanitize 변경 — jsoup 함정 주의]
- Safelist에 addAttributes("img", "src", ...)만 하면 프로토콜 검사가 걸리지 않아
  javascript:, data: 가 통과한다. 반대로 addProtocols를 걸면 상대경로가 프로토콜 검사에
  걸려 src가 통째로 사라진다. 둘 다 틀리다. 다음처럼 해:
  1) Safelist에 addTags("img") + addAttributes("img","src","alt","width"),
     addProtocols는 호출하지 않는다
  2) Jsoup.clean() 이후 Document를 순회하며 src를 정규식으로 검증한다
     ^/api/files/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$
  3) 불일치 요소는 remove()로 통째 제거한다
     (속성만 지우면 src 없는 깨진 img 태그가 남는다)
- 외부 URL과 data: URI는 이 규칙으로 자동 제거된다

[기타]
- 루트 저장소의 .gitignore에 upload/ 추가

Swagger는 @Tag + @Operation만 붙여줘 (io.swagger의 ApiResponse는 프로젝트 ApiResponse와
simple name이 충돌하므로 이 프로젝트에서는 쓰지 않는다).
끝나면 curl로 업로드 → todo-project/upload 폴더에 실제 파일 생성 확인
→ GET /api/files/{uuid} 이미지 응답 확인 → 남의 파일 접근 404를 직접 검증해서 결과를 보여줘.
```

**완료 조건**

- [ ] `todo-project/upload/todos/{userId}/{년}/{월}/` 경로에 파일이 실제로 생성됨
- [ ] `GET /api/files/{uuid}` 접근 시 이미지가 응답되고 보안 헤더 5종이 붙음
- [ ] 다른 계정으로 접근 시 `FILE_NOT_FOUND` 404
- [ ] 확장자를 `.png`로 위조한 텍스트 파일이 `INVALID_FILE_TYPE`으로 거부됨
- [ ] `upload/`가 git에 잡히지 않음

---

### 5.2 프론트엔드: Tiptap 이미지 확장

```
5.2: Tiptap 에디터에 이미지 업로드를 붙인다.

[설치]
- @tiptap/extension-image (현재 미설치). 설치된 Tiptap 3.30.6과 메이저를 맞춘다

[rewrite]
- next.config.ts에 /api/files/:path* → ${NEXT_PUBLIC_API_BASE_URL}/api/files/:path* rewrite 추가
  (이 문서 4장 그대로). /api/* 전체를 프록시하지 마 — lib/api/client.ts가 이미 절대 URL로 호출한다
- 환경변수명은 NEXT_PUBLIC_API_BASE_URL이다 (NEXT_PUBLIC_API_URL 아님)

[업로드]
- lib/api/client.ts의 apiFetch에 multipart 분기 추가:
  body가 FormData면 Content-Type 헤더를 붙이지 않고(브라우저가 boundary를 넣어야 한다)
  JSON.stringify도 하지 않는다. 기존 ApiClientError 변환과 봉투 언랩 로직은 그대로 재사용해
- lib/api/files.ts: uploadImage(file) → POST /api/files/images
- hooks/useImageUpload: 업로드 중 상태, 에러 상태 관리

[에디터]
- components/editor/extensions.ts의 getTiptapExtensions()에 Image 확장 추가
  (편집기 TiptapEditor와 뷰어 TiptapViewer가 공유하는 유일한 지점이다)
- 툴바는 TOOLBAR_GROUPS 배열에 4번째 그룹으로 추가한다.
  다만 파일 선택은 { label, icon, isActive, run(editor) } 시그니처만으로는 안 되므로
  숨겨진 input[type=file]을 함께 두는 방식으로 이 항목만 예외 처리해
- 드래그 앤 드롭과 클립보드 붙여넣기는 extension-image만으로는 동작하지 않는다.
  editorProps.handleDrop / handlePaste로 파일을 가로채서 업로드로 넘겨
- 업로드 중에는 자리표시자를 보여주고 완료되면 실제 이미지로 교체한다
  (ProseMirror decoration 또는 임시 placeholder 노드)
- 실패 시 자리표시자를 제거하고 에러 메시지 표시.
  메시지는 lib/api/errors.ts의 extractErrorMessage를 재사용해
  (서버가 FILE_TOO_LARGE / INVALID_FILE_TYPE에 한국어 문장을 담아 보낸다)
- 업로드 전 클라이언트에서도 타입·용량(5MB)을 1차 검증 (서버 검증은 그대로 유지)
- 삽입되는 src는 서버가 준 /api/files/{uuid}를 그대로 쓴다.
  절대 URL이나 파일 시스템 경로를 넣지 마 — sanitize가 제거한다

[표시]
- app/globals.css의 .tiptap-content 블록에 img 규칙 추가
  (현재 img 규칙이 없다): max-width 100%, height auto, 라운드, 라이트/다크 공통

[타입]
- types/api.ts에 ImageUploadResponse 추가. any 금지.
  단 이 파일은 "요청 타입은 lib/api/*.ts에 co-locate"가 규칙이므로 응답 타입만 여기 둔다

끝나면 npm run check 와 npm run build 를 돌려서 결과를 알려줘.
```

---

### 5.3 정리 및 테스트

```
5.3: 고아 파일 정리와 통합 테스트를 추가한다.

[정리]
- TodoBackendApplication에 @EnableScheduling 추가
  (이 프로젝트에 @Scheduled가 하나도 없으므로 신규 인프라다. 도입 사실을 주석으로 남겨)
- 정리 대상: todo_id가 null이고 updated_at이 24시간 이전인 Attachment
  (created_at이 아니다 — 오래된 이미지를 오늘 본문에서 뺐을 때 즉시 삭제되는 것을 막는다)
- 삭제 직전 가드: 활성 Todo 본문 어디에도 해당 uuid가 없는지 재확인하고,
  통과한 것만 지운다 (본문 복붙으로 두 Todo가 같은 이미지를 참조하는 경우 방어)
- 삭제 방식: Attachment 레코드는 markDeleted()로 deleted_at만 기록하고,
  실제 blob만 FileStorageService.delete로 물리 삭제한다.
  Soft Delete 불변 규칙에 예외를 만들지 않는다
- 하루 1회 실행. 대상 건수와 소요 시간을 로그로 남긴다
- 관리자 API는 범위 밖이다. 수동 실행은 테스트에서 서비스 메서드를 직접 호출하는 방식으로 해

[테스트]
application-test.properties 기준으로 통합 테스트 추가.
기존 TodoControllerTest 스타일(@SpringBootTest + @AutoConfigureMockMvc + @ActiveProfiles("test"),
signup 헬퍼로 access_token 쿠키 획득)을 따른다.
저장 경로는 ./target/test-upload를 쓰고 테스트 종료 후 정리한다:
1. 이미지 업로드 성공 → Attachment 생성 + 파일 실제 생성 확인
2. 5MB 초과 파일 → FILE_TOO_LARGE
3. 확장자만 .png로 위조한 text/plain → INVALID_FILE_TYPE
4. 인증 없이 업로드 시 401 UNAUTHORIZED
5. 다른 사용자의 파일 조회 시 404 FILE_NOT_FOUND
6. description에 외부 URL img를 저장하면 제거됨
7. description에 javascript: src img를 저장하면 제거됨
8. 정상 /api/files/{uuid} src는 sanitize를 통과해 그대로 남음 (상대경로 생존을 고정한다)
9. Todo 생성 시 본문 내 이미지의 todo_id가 채워짐
10. 남의 uuid를 본문에 적어도 그 사람의 Attachment.todo_id가 바뀌지 않음
11. storage_key가 base-dir를 벗어나는 값이면 load가 거부됨
    (파일명은 서버가 UUID로 만들므로 "../가 든 업로드 파일명"은 성립하지 않는다.
     실제 위험 지점은 DB의 storage_key다)
12. 고아 정리: 활성 Todo가 참조 중인 첨부는 정리되지 않음

로컬 저장소를 쓰므로 외부 mocking 없이 실제로 테스트가 돈다.
```

---

### 5.4 S3 전환 (v1.1 배포 시)

> **이번 범위가 아니다.** 5.1~5.3에서 인터페이스와 `storage_type` 컬럼만 준비하고,
> 실제 구현은 `ROADMAP.md` 7장 v1.1(AWS 배포)에서 진행한다.

```
5.4: S3 저장소 구현을 추가한다. 기존 로컬 구현은 그대로 둔다.

[의존성]
- software.amazon.awssdk:s3 (PRD 1.3 설치 상태 표에 행 추가)

[구현]
- config/S3Config: S3Client, S3Presigner 빈. 리전·버킷·키는 전부 환경변수
- S3FileStorageService:
  - @ConditionalOnProperty(name="file.storage.type", havingValue="s3")
  - store: 버킷에 업로드 (ACL 설정하지 않는다 — 버킷은 비공개 유지)
  - getRedirectUrl: 유효기간 5분의 presigned GET URL
  - load: 지원하지 않음 (리다이렉트 방식 사용)
  - getType: S3

[설정]
- 운영에서는 환경변수로 FILE_STORAGE_TYPE=s3
- 전환 후에도 기존 LOCAL 레코드는 로컬 방식으로 조회돼야 한다.
  storage_type에 따라 분기하는지 반드시 확인해

[검증]
- 로컬에서 FILE_STORAGE_TYPE=s3로 한 번 띄워서 업로드/조회가 되는지 확인
- S3 콘솔에서 객체 URL 직접 접근이 차단되는지(403) 확인
- 프론트 호스트의 /api/files/* rewrite가 302를 그대로 전달하는지 확인
```

---

## 6. 환경변수 / 설정

> **`todo-backend/.env`를 만들지 않는다.** 이 프로젝트에는 `.env` 파일도 dotenv 라이브러리도 없어
> 파일을 만들어도 Spring이 읽지 않는다. v1의 `.env` 지시는 구버전 문서에서 온 오류다.

값을 주입하는 실제 경로는 세 가지다.

| 환경      | 방법                                                             |
| --------- | ---------------------------------------------------------------- |
| 로컬 개발 | `application-local.properties` (gitignore 대상) 또는 OS 환경변수 |
| 테스트    | `application-test.properties` (5.0 참고)                         |
| CI        | `.github/workflows/ci.yml`의 `env:` 블록                         |

이번 기능이 추가하는 키:

```properties
# 로컬 개발 기본값 — AWS 키 없이 동작한다
FILE_STORAGE_TYPE=local
FILE_LOCAL_BASE_DIR=../upload

# S3 전환 시에만 필요 (5.4)
AWS_REGION=ap-northeast-2
AWS_S3_BUCKET=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
```

`FILE_LOCAL_BASE_DIR`의 기본값 `../upload`는 **`todo-backend`를 작업 디렉터리로 실행할 때**
`todo-project/upload`를 가리킨다. IDE 등에서 작업 디렉터리가 다르면 절대경로로 지정한다 —
그래서 애플리케이션 시작 시 해석된 절대경로를 로그로 남기도록 했다(5.1).

프론트엔드는 `NEXT_PUBLIC_API_BASE_URL` 하나만 쓰며, 없으면 `http://localhost:8080`으로 동작한다.

---

## 7. 검증 체크리스트

**로컬 (5.0~5.3)**

- [ ] `attachments` 테이블 생성, 인덱스 적용 (`schema.sql`은 변경되지 않음)
- [ ] `todo-project/upload/` 폴더가 자동 생성되고 절대경로가 로그에 찍힘
- [ ] 에디터에서 파일 선택 / 드래그 / 붙여넣기 3가지 모두 업로드됨
- [ ] 업로드 중 자리표시자 → 완료 시 이미지로 교체
- [ ] Todo 저장 후 다시 열었을 때 이미지가 정상 표시됨 (rewrite 동작 확인)
- [ ] 저장된 HTML의 `src`가 `/api/files/{uuid}` 상대경로임 (절대 URL이 섞이지 않음)
- [ ] 다른 계정으로 `/api/files/{uuid}` 접근 시 404 `FILE_NOT_FOUND`
- [ ] 5MB 초과 → `FILE_TOO_LARGE`, 위조된 확장자 → `INVALID_FILE_TYPE`
- [ ] 외부 URL·`javascript:`·`data:` 이미지가 sanitize로 제거되고, 정상 상대경로는 살아남음
- [ ] 본문에서 이미지를 뺀 뒤 24시간 이내에는 정리되지 않음
- [ ] 두 Todo가 같은 이미지를 참조할 때 한쪽에서 빼도 다른 쪽이 깨지지 않음
- [ ] `upload/`가 git에 커밋되지 않음
- [ ] `./mvnw clean verify`, `npm run check`, `npm run build` 통과 (또는 `/check-all`)

**S3 전환 (5.4, v1.1)**

- [ ] `FILE_STORAGE_TYPE=s3`로 업로드·조회 성공
- [ ] 버킷이 비공개이고 객체 URL 직접 접근이 403
- [ ] 기존 LOCAL 레코드가 여전히 정상 조회됨
- [ ] 저장소에 AWS 키가 없음 (secretlint 통과)

---

## 8. 기존 문서 갱신

> v1은 `API_SPEC.md`를 갱신 대상에서 빠뜨렸다. `PRD.md` 5.4가 "백엔드 계약의 전체 목록"을 자처하고
> `API_SPEC.md`가 "엔드포인트 목록의 단일 출처는 PRD 5.4"라고 선언하므로 **둘 다** 고쳐야 한다.

| 문서               | 갱신 내용                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/API_SPEC.md` | 3장 다음에 **파일 API 장 신설** (`POST /api/files/images`, `GET /api/files/{uuid}`) · 1.1에 **multipart 예외 조항** · 1.3에 **바이너리/302 예외 조항** · 1.5에 **에러 코드 3종** · 5장 FR↔엔드포인트 대응표에 `FR-T14`                                                                                                                                                                                                  |
| `docs/PRD.md`      | 5.4 엔드포인트 목록에 2건 추가 · 5.2에 `FR-T14` "사용자는 할 일 상세 설명에 이미지를 첨부할 수 있다" · **FR-T04 서식 목록에 "이미지" 추가** · 8.2에 `Attachment` 엔티티 · 9.1에 `NFR-S09` "업로드 파일은 타입·크기를 서버에서 검증하고 저장 경로는 서버가 생성한다" · 10장에 에러 코드 3종 · 4.2 제외 항목을 "S3 연동(v1.1)"으로 축소 · 13장 OQ-4 **해결됨** · **1.3 설치 상태 표에 `@tiptap/extension-image` 행 추가** |
| 루트 `CLAUDE.md`   | "불변 규칙" 절에 `attachments` 스키마·에러 코드 3종·sanitize `img` 규칙(src는 `/api/files/{uuid}` 형태만) 추가. **장 번호가 아니라 절 제목으로 지칭한다**                                                                                                                                                                                                                                                               |
| `docs/ROADMAP.md`  | 3장에 **M7 (로컬 이미지 첨부)** 신설 · 9장 진행 현황에 행 추가 · **7장 v1.1에 S3 전환 단계 추가** · 8장 v2.0 후보에서 "이미지 첨부" 제거                                                                                                                                                                                                                                                                                |

번호 체계 확인: 현재 마지막 번호는 `FR-T13` / `NFR-S08` / `M6`이므로
`FR-T14` / `NFR-S09` / `M7`이 정확하다.

### 부수 정리 (별도 판단)

- `.playwright-mcp/CLAUDE.md`(장 번호가 있는 구버전, git 미추적)가 남아 있는 한 같은 혼선이 반복된다.
  삭제하거나 파일 상단에 "구버전 — 참조 금지"를 명시하는 편이 좋다.
